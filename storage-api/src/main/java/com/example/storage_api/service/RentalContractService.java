package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.RentalContractResponse;
import com.example.storage_api.model.request.ContractSignRequest;
import com.example.storage_api.model.request.RenewalRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class RentalContractService {
    private static final Pattern STORED_FILE_URL = Pattern.compile(
            "^/api/files/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.(png|jpg|jpeg|gif|webp)$");

    private final RentalContractRepository contractRepository;
    private final ReservationRepository reservationRepository;
    private final PaymentRepository paymentRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PriceRuleRepository priceRuleRepository;
    private final AppointmentRepository appointmentRepository;
    private final UnitReturnRepository unitReturnRepository;
    private final CurrentUserService currentUserService;
    private final ReservationService reservationService;
    // Member 4: chuông thông báo khi hợp đồng quá hạn hoặc nhận kho hoàn tất.
    private final OperationsNotificationService notifier;

    @Value("${app.upload.dir:uploads}")
    private String uploadDir;

    /**
     * Tự động đồng bộ khi khởi động server (chạy sau DataInit, OperationsDataSeeder và AppointmentBackfillRunner):
     * 1. Chuẩn hóa các đơn/hợp đồng mẫu do OperationsDataSeeder tạo tại "Kho Trung Tâm Quận 1" có giá tượng trưng (300 / 900)
     *    về đúng bảng giá VNĐ của DataInit, tạo đủ hóa đơn cọc / hóa đơn Đợt 2 còn thiếu.
     * 2. Đóng (COMPLETED) các lịch hẹn CHECK_IN bị treo ở SCHEDULED của các hợp đồng đã ACTIVE / OVERDUE / COMPLETED.
     * 3. Xóa chuỗi kỹ thuật "DOT_2_THANH_TOAN_FULL_KHO" trên các hóa đơn đang PENDING.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.LOWEST_PRECEDENCE)
    @Transactional
    public void healExistingContractsOnStartup() {
        for (Reservation r : reservationRepository.findAll()) {
            if (r.getFacility() != null
                    && "Kho Trung Tâm Quận 1".equals(r.getFacility().getName())
                    && r.getUnitType() != null
                    && r.getEstimatedAmount() != null
                    && r.getEstimatedAmount().compareTo(BigDecimal.valueOf(10000)) < 0) {
                int months = r.getRentalMonths() != null && r.getRentalMonths() > 0 ? r.getRentalMonths() : 1;
                BigDecimal monthly = reservationService.resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
                BigDecimal fullRental = reservationService.applyDiscount(
                        monthly.multiply(BigDecimal.valueOf(months)).setScale(2, RoundingMode.HALF_UP),
                        months, r.getFacility().getId(), r.getUnitType().getId());
                BigDecimal deposit = reservationService.resolveDepositAmount(
                        r.getFacility().getId(), r.getUnitType().getId(), monthly, fullRental);
                r.setEstimatedAmount(fullRental);
                reservationRepository.save(r);

                for (Payment p : paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId())) {
                    if (p.getPaymentType() == PaymentType.DEPOSIT && p.getAmount().compareTo(BigDecimal.valueOf(10000)) < 0) {
                        p.setAmount(deposit);
                        paymentRepository.save(p);
                    }
                }
                contractRepository.findByReservation_Id(r.getId()).ifPresent(c -> {
                    if (c.getMonthlyPrice() != null && c.getMonthlyPrice().compareTo(BigDecimal.valueOf(10000)) < 0) {
                        c.setMonthlyPrice(monthly);
                        c.setDepositAmount(deposit);
                        contractRepository.save(c);
                    }
                });
            }
            if (r.getStatus() == ReservationStatus.PENDING) {
                reservationService.ensureDepositPaymentExists(r);
            }
        }

        for (Payment p : paymentRepository.findAll()) {
            if (p.getStatus() == PaymentStatus.PENDING
                    && "DOT_2_THANH_TOAN_FULL_KHO".equals(p.getTransactionReference())) {
                p.setTransactionReference(null);
                paymentRepository.save(p);
            }
        }

        List<RentalContract> allContracts = contractRepository.findAll();
        allContracts.forEach(this::syncContractAndAppointments);
    }

    @Transactional
    public RentalContractResponse create(Integer reservationId) {
        Users caller = currentUserService.get();
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + reservationId));
        if (caller.getRole() == Role.CUSTOMER) {
            if (!reservation.getCustomer().getId().equals(caller.getId())) {
                throw new BadRequestException("Reservation is not yours");
            }
        } else {
            currentUserService.assertFacilityAccess(caller, reservation.getFacility().getId());
        }

        if (reservation.getStorageUnit() == null) {
            throw new BadRequestException("Reservation must have an assigned storage unit");
        }
        if (reservation.getStatus() != ReservationStatus.CONFIRMED
                && reservation.getStatus() != ReservationStatus.ASSIGNED) {
            throw new ConflictException("Only assigned or confirmed reservations can create a contract");
        }
        if (!paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                reservation.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
            throw new BadRequestException("The deposit (stage 1) must be paid before creating a rental contract");
        }
        Optional<RentalContract> existing = contractRepository.findByReservation_Id(reservationId);
        if (existing.isPresent()) {
            throw new ConflictException("A rental contract already exists for this reservation");
        }

        BigDecimal monthlyPrice = resolveMonthlyAmount(
                reservation.getFacility().getId(), reservation.getUnitType().getId());
        BigDecimal fullRental = reservation.getEstimatedAmount() != null
                ? reservation.getEstimatedAmount()
                : monthlyPrice.multiply(BigDecimal.valueOf(reservation.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal depositAmount = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                        reservation.getId(), PaymentType.DEPOSIT)
                .map(Payment::getAmount)
                .orElseGet(() -> resolveDepositAmount(reservation, fullRental));

        RentalContract contract = new RentalContract();
        contract.setReservation(reservation);
        contract.setCustomer(reservation.getCustomer());
        contract.setStorageUnit(reservation.getStorageUnit());
        contract.setStartDate(reservation.getStartDate());
        contract.setEndDate(reservation.getStartDate().plusMonths(reservation.getRentalMonths()).minusDays(1));
        contract.setMonthlyPrice(monthlyPrice);
        contract.setDepositAmount(depositAmount);
        contract.setStatus(ContractStatus.PENDING);
        RentalContract saved = contractRepository.save(contract);

        appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(reservation.getCustomer().getId()).stream()
                .filter(a -> a.getReservation() != null && a.getReservation().getId().equals(reservation.getId()))
                .forEach(a -> { a.setRentalContract(saved); appointmentRepository.save(a); });

        boolean hasRentalPayment = paymentRepository.findByReservation_IdOrderByCreatedAtDesc(reservation.getId()).stream()
                .anyMatch(p -> p.getPaymentType() == PaymentType.RENTAL);
        if (!hasRentalPayment) {
            Payment stage2 = new Payment();
            stage2.setCustomer(reservation.getCustomer());
            stage2.setReservation(reservation);
            stage2.setRentalContract(saved);
            stage2.setPaymentType(PaymentType.RENTAL);
            stage2.setAmount(fullRental);
            stage2.setStatus(PaymentStatus.PENDING);
            paymentRepository.save(stage2);
        }
        paymentRepository.findByReservation_IdOrderByCreatedAtDesc(reservation.getId()).stream()
                .filter(p -> p.getRentalContract() == null)
                .forEach(p -> { p.setRentalContract(saved); paymentRepository.save(p); });

        return toResponse(saved);
    }

    @Transactional
    public List<RentalContractResponse> mine() {
        Users customer = currentUserService.get();
        List<RentalContract> contracts = contractRepository.findByCustomer_IdOrderByCreatedAtDesc(customer.getId());
        contracts.forEach(this::syncContractAndAppointments);
        return contracts.stream().map(this::toResponse).toList();
    }

    @Transactional
    public List<RentalContractResponse> list(Long facilityId) {
        return list(facilityId, null);
    }

    @Transactional
    public List<RentalContractResponse> list(Long facilityId, ContractStatus status) {
        Users caller = currentUserService.get();
        Long scope = facilityId;
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.FACILITY_MANAGER) {
            Long assigned = currentUserService.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(assigned)) {
                throw new BadRequestException("Facility access denied");
            }
            scope = assigned;
        }
        if (scope == null) {
            List<RentalContract> all = status == null
                    ? contractRepository.findAllByOrderByCreatedAtDesc()
                    : contractRepository.findByStatusOrderByCreatedAtDesc(status);
            all.forEach(this::syncContractAndAppointments);
            return all.stream().map(this::toResponse).toList();
        }
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, scope);
        }
        List<RentalContract> rows = status == null
                ? contractRepository.findByStorageUnit_Facility_IdOrderByCreatedAtDesc(scope)
                : contractRepository.findByStorageUnit_Facility_IdAndStatusOrderByCreatedAtDesc(scope, status);
        rows.forEach(this::syncContractAndAppointments);
        return rows.stream().map(this::toResponse).toList();
    }

    @Transactional
    public RentalContractResponse get(Integer id) {
        RentalContract contract = findOrThrow(id);
        authorizeView(currentUserService.get(), contract);
        syncContractAndAppointments(contract);
        return toResponse(contract);
    }

    /**
     * Đồng bộ dữ liệu tự động cho hợp đồng:
     * - Nếu hợp đồng đã ACTIVE / OVERDUE / COMPLETED mà lịch hẹn CHECK_IN vẫn đang SCHEDULED (lịch treo cũ) -> đóng COMPLETED.
     * - Nếu hợp đồng đang PENDING và đã đóng cọc (như dữ liệu seed A03) mà chưa có hóa đơn Đợt 2 -> tự tạo hóa đơn Đợt 2.
     */
    @Transactional
    public void syncContractAndAppointments(RentalContract contract) {
        if (contract == null) {
            return;
        }
        if (contract.getStatus() == ContractStatus.ACTIVE
                || contract.getStatus() == ContractStatus.OVERDUE
                || contract.getStatus() == ContractStatus.COMPLETED) {
            closeScheduledCheckInAppointments(contract);
        }
        Reservation r = contract.getReservation();
        if (r != null) {
            paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                    .filter(p -> p.getRentalContract() == null)
                    .forEach(p -> {
                        p.setRentalContract(contract);
                        paymentRepository.save(p);
                    });
            if (contract.getStatus() == ContractStatus.PENDING
                    && paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                            r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
                boolean hasRental = paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                        .anyMatch(p -> p.getPaymentType() == PaymentType.RENTAL);
                if (!hasRental) {
                    BigDecimal fullRental = r.getEstimatedAmount() != null
                            ? r.getEstimatedAmount()
                            : contract.getMonthlyPrice().multiply(BigDecimal.valueOf(r.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
                    Payment stage2 = new Payment();
                    stage2.setCustomer(contract.getCustomer());
                    stage2.setReservation(r);
                    stage2.setRentalContract(contract);
                    stage2.setPaymentType(PaymentType.RENTAL);
                    stage2.setAmount(fullRental);
                    stage2.setStatus(PaymentStatus.PENDING);
                    paymentRepository.save(stage2);
                }
            }
        }
    }

    /**
     * Ký hợp đồng điện tử (POST /api/rental-contracts/{id}/sign).
     */
    @Transactional
    public RentalContractResponse signContract(Integer id, ContractSignRequest request) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (caller.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("Only the contract customer can sign the contract");
        }
        if (contract.getSignedAt() != null) {
            throw new ConflictException("Contract already signed");
        }
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Only PENDING contracts can be signed (current: " + contract.getStatus() + ")");
        }
        if (request == null || request.getSignatureUrl() == null || request.getSignatureUrl().isBlank()) {
            throw new BadRequestException("Signature is required");
        }
        String trimmedSig = request.getSignatureUrl().trim();
        if (!isValidSignatureImage(trimmedSig)) {
            throw new BadRequestException("Signature must be a valid image (PNG, JPEG, GIF, or WebP)");
        }
        String storedSig = persistSignatureIfLargeDataUrl(trimmedSig);
        String resolvedSigner = (request.getSignerName() != null && !request.getSignerName().isBlank())
                ? request.getSignerName().trim()
                : caller.getFullname();
        contract.setSignedAt(LocalDateTime.now());
        contract.setSignerName(resolvedSigner);
        contract.setSignatureUrl(storedSig);
        return toResponse(contractRepository.save(contract));
    }

    private String persistSignatureIfLargeDataUrl(String sig) {
        if (sig == null || !sig.startsWith("data:image/") || sig.length() <= 240) {
            return sig;
        }
        int base64Idx = sig.indexOf(";base64,");
        if (base64Idx <= 0) {
            return sig;
        }
        try {
            String b64 = sig.substring(base64Idx + ";base64,".length()).replaceAll("\\s+", "");
            byte[] bytes = Base64.getDecoder().decode(b64);
            String ext = "png";
            if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8) {
                ext = "jpg";
            } else if (bytes.length >= 6 && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F') {
                ext = "gif";
            } else if (bytes.length >= 12 && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
                ext = "webp";
            }
            Path root = Paths.get(uploadDir != null ? uploadDir : "uploads").toAbsolutePath().normalize();
            Files.createDirectories(root);
            String filename = UUID.randomUUID() + "." + ext;
            Files.write(root.resolve(filename), bytes);
            return "/api/files/" + filename;
        } catch (IOException | IllegalArgumentException e) {
            return sig;
        }
    }

    private boolean isValidSignatureImage(String sig) {
        if (sig == null || sig.isBlank()) {
            return false;
        }
        if (STORED_FILE_URL.matcher(sig).matches()) {
            return true;
        }
        if (!sig.startsWith("data:image/")) {
            return false;
        }
        int base64Idx = sig.indexOf(";base64,");
        if (base64Idx <= "data:image/".length()) {
            return false;
        }
        String mimeSub = sig.substring("data:image/".length(), base64Idx).toLowerCase();
        if (!mimeSub.equals("png") && !mimeSub.equals("jpeg") && !mimeSub.equals("jpg")
                && !mimeSub.equals("gif") && !mimeSub.equals("webp")) {
            return false;
        }
        String b64 = sig.substring(base64Idx + ";base64,".length()).replaceAll("\\s+", "");
        if (b64.isEmpty()) {
            return false;
        }
        try {
            byte[] h = Base64.getDecoder().decode(b64);
            if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') {
                return true;
            }
            if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) {
                return true;
            }
            if (h.length >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') {
                return true;
            }
            if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                    && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') {
                return true;
            }
            return false;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Luồng Renewal chuẩn theo đặc tả.
     */
    @Transactional
    public RentalContractResponse renew(Integer id, RenewalRequest request) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (caller.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("Only the contract customer can request a renewal");
        }
        if (request.getMonths() == null || request.getMonths() < 1 || request.getMonths() > 12) {
            throw new BadRequestException("Renewal duration must be between 1 and 12 months");
        }
        if (Boolean.TRUE.equals(request.getPaid())) {
            throw new BadRequestException("Customers cannot directly mark renewal as paid; complete payment via PATCH /api/payments/{id}/paid");
        }
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Only active or overdue contracts can be renewed");
        }

        BigDecimal renewalMonthly = resolveRenewalMonthlyRate(contract);
        BigDecimal totalRenewalAmount = renewalMonthly.multiply(BigDecimal.valueOf(request.getMonths()))
                .setScale(2, RoundingMode.HALF_UP);

        String method = request.getPaymentMethod() != null && !request.getPaymentMethod().isBlank()
                ? request.getPaymentMethod().trim()
                : null;
        String ref = "RENEW_MONTHS:" + request.getMonths();

        Payment renewalPayment = paymentRepository
                .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getId(), PaymentType.RENEWAL, PaymentStatus.PENDING)
                .orElseGet(Payment::new);

        renewalPayment.setCustomer(contract.getCustomer());
        renewalPayment.setReservation(contract.getReservation());
        renewalPayment.setRentalContract(contract);
        renewalPayment.setPaymentType(PaymentType.RENEWAL);
        renewalPayment.setAmount(totalRenewalAmount);
        renewalPayment.setPaymentMethod(method);
        renewalPayment.setTransactionReference(ref);
        renewalPayment.setStatus(PaymentStatus.PENDING);
        renewalPayment.setPaidAt(null);
        paymentRepository.save(renewalPayment);

        return toResponse(contract);
    }

    /**
     * Đánh dấu 1 hợp đồng là OVERDUE (PATCH /api/rental-contracts/{id}/overdue) và tự động tạo Payment OVERDUE_FEE (PENDING).
     */
    @Transactional
    public RentalContractResponse markSingleOverdue(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Only active or overdue contracts can be marked overdue (current: " + contract.getStatus() + ")");
        }
        applyOverdueAndCreateFee(contract);
        return toResponse(contract);
    }

    /**
     * Quét hàng loạt tất cả hợp đồng ACTIVE đã quá hạn (EndDate < hôm nay), chuyển sang OVERDUE và tạo Payment OVERDUE_FEE.
     */
    @Scheduled(initialDelayString = "${app.reminders.initial-delay-ms:60000}", fixedDelayString = "${app.reminders.interval-ms:900000}")
    @Transactional
    public int markOverdue() {
        List<RentalContract> expired = contractRepository.findByStatusAndEndDateBefore(
                ContractStatus.ACTIVE, LocalDate.now());
        expired.forEach(this::applyOverdueAndCreateFee);
        return expired.size();
    }

    /**
     * Kích hoạt hợp đồng (PATCH /api/rental-contracts/{id}/activate) — BR-52 & BR-62:
<<<<<<< Updated upstream
     * Bắt buộc khách đã ký hợp đồng (signedAt != null) và đã thanh toán đủ cả Đợt 1 (DEPOSIT = PAID)
     * lẫn Đợt 2 (RENTAL = PAID, không còn khoản RENTAL nào đang PENDING).
     * Đồng thời tự động đóng (COMPLETED) lịch hẹn CHECK_IN đang chờ (SCHEDULED) của đơn/hợp đồng đó.
=======
     * Đồng bộ hành vi 100% với AppointmentService.completeCheckIn của Member 4.
>>>>>>> Stashed changes
     */
    @Transactional
    public RentalContractResponse activateContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Contract must be PENDING to activate (current: " + contract.getStatus() + ")");
        }
        if (contract.getSignedAt() == null) {
            throw new BadRequestException("Customer must sign the contract before activation");
        }
        Reservation reservation = contract.getReservation();
        if (reservation == null || !paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                reservation.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
            throw new BadRequestException("The deposit (stage 1) has not been paid yet");
        }
        boolean rentalPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                reservation.getId(), PaymentType.RENTAL, PaymentStatus.PAID)
                || paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.RENTAL, PaymentStatus.PAID);
        boolean rentalPending = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                reservation.getId(), PaymentType.RENTAL, PaymentStatus.PENDING)
                || paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.RENTAL, PaymentStatus.PENDING);
        if (!rentalPaid || rentalPending) {
            throw new BadRequestException("The rental payment (stage 2) has not been paid yet");
        }

        contract.setStatus(ContractStatus.ACTIVE);
        StorageUnit unit = contract.getStorageUnit();
        unit.setStatus(UnitStatus.OCCUPIED);
        storageUnitRepository.save(unit);
        if (reservation.getStatus() != ReservationStatus.COMPLETED) {
            reservation.setStatus(ReservationStatus.COMPLETED);
            reservationRepository.save(reservation);
        }
        RentalContract saved = contractRepository.save(contract);
        closeScheduledCheckInAppointments(saved);
<<<<<<< Updated upstream
=======
        notifier.notifyUser(saved.getCustomer(), "Check-in completed", "Welcome to your storage unit",
                "Your check-in at " + unit.getFacility().getName() + " is complete. "
                        + "Unit " + unit.getUnitCode() + " is now active and the key has been handed over to you.",
                "/account/units");
>>>>>>> Stashed changes
        return toResponse(saved);
    }

    /**
     * Hoàn tất hợp đồng (PATCH /api/rental-contracts/{id}/complete) — BR-56.
     */
    @Transactional
    public RentalContractResponse completeContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Only ACTIVE or OVERDUE contracts can be completed");
        }
        if (!unitReturnRepository.existsByRentalContract_Id(contract.getId())) {
            throw new BadRequestException("Unit return inspection (POST /api/unit-returns) is required before completing the contract");
        }
        StorageUnit unit = contract.getStorageUnit();
        if (unit != null && unit.getStatus() == UnitStatus.OCCUPIED) {
            unit.setStatus(UnitStatus.AVAILABLE);
            storageUnitRepository.save(unit);
        }
        refundDepositOnReturn(contract, null);
        contract.setStatus(ContractStatus.COMPLETED);
        RentalContract saved = contractRepository.save(contract);
        closeScheduledCheckInAppointments(saved);
        return toResponse(saved);
    }

    /**
     * Hoàn trả tiền cọc (DEPOSIT -> REFUNDED) khi khách trả kho / kết thúc hợp đồng bình thường.
     */
    @Transactional
    public void refundDepositOnReturn(RentalContract contract, BigDecimal damageFee) {
        if (contract == null) {
            return;
        }
        closeScheduledCheckInAppointments(contract);
        Optional<Payment> paidDepositOpt = Optional.empty();
        if (contract.getReservation() != null) {
            paidDepositOpt = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                    contract.getReservation().getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        }
        if (paidDepositOpt.isEmpty()) {
            paidDepositOpt = paymentRepository.findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                    contract.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        }
        if (paidDepositOpt.isPresent()) {
            Payment depositPayment = paidDepositOpt.get();
            BigDecimal baseDeposit = contract.getDepositAmount() != null
                    ? contract.getDepositAmount()
                    : depositPayment.getAmount();
            BigDecimal deduction = (damageFee != null && damageFee.signum() > 0) ? damageFee : BigDecimal.ZERO;
            BigDecimal refundAmount = baseDeposit.subtract(deduction).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);

            depositPayment.setStatus(PaymentStatus.REFUNDED);
            String refundNote = refundAmount.signum() == 0
                    ? "KHAU_TRU_100%_COC_DO_HU_HAI:0.00"
                    : (deduction.signum() > 0
                    ? "HOAN_COC_SAU_TRU_HU_HAI:" + refundAmount
                    : "HOAN_COC_100%:" + refundAmount);
            depositPayment.setTransactionReference(refundNote);
            paymentRepository.save(depositPayment);
        }
    }

<<<<<<< Updated upstream
    private void closeScheduledCheckInAppointments(RentalContract contract) {
=======
    public void closeScheduledCheckInAppointments(RentalContract contract) {
>>>>>>> Stashed changes
        if (contract == null) {
            return;
        }
        if (contract.getReservation() != null) {
            appointmentRepository.findByReservation_IdAndAppointmentTypeAndStatus(
                            contract.getReservation().getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)
                    .forEach(a -> {
                        a.setRentalContract(contract);
                        a.setStatus(AppointmentStatus.COMPLETED);
<<<<<<< Updated upstream
=======
                        if (a.getNotes() == null || !a.getNotes().contains("Key handed over")) {
                            a.setNotes(a.getNotes() == null || a.getNotes().isBlank() ? "Key handed over." : a.getNotes() + " | Key handed over.");
                        }
>>>>>>> Stashed changes
                        appointmentRepository.save(a);
                    });
        }
        if (contract.getId() != null) {
            appointmentRepository.findByRentalContract_IdAndAppointmentTypeAndStatus(
                            contract.getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)
                    .forEach(a -> {
                        a.setStatus(AppointmentStatus.COMPLETED);
<<<<<<< Updated upstream
=======
                        if (a.getNotes() == null || !a.getNotes().contains("Key handed over")) {
                            a.setNotes(a.getNotes() == null || a.getNotes().isBlank() ? "Key handed over." : a.getNotes() + " | Key handed over.");
                        }
>>>>>>> Stashed changes
                        appointmentRepository.save(a);
                    });
        }
    }

    private void applyOverdueAndCreateFee(RentalContract contract) {
        boolean wasAlreadyOverdue = contract.getStatus() == ContractStatus.OVERDUE;
        contract.setStatus(ContractStatus.OVERDUE);
        contractRepository.save(contract);
        if (!wasAlreadyOverdue) {
            notifier.notifyUser(contract.getCustomer(), "Rental overdue", "Your rental is overdue",
                    "Contract #" + contract.getId() + " ended on " + contract.getEndDate() + ". Please renew it or return the unit; "
                            + "an overdue fee has been issued.", "/account/contracts/" + contract.getId());
        }

        boolean hasActiveOverdueFee = paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contract.getId())
                .stream()
                .anyMatch(p -> p.getPaymentType() == PaymentType.OVERDUE_FEE
                        && (p.getStatus() == PaymentStatus.PENDING
                        || (wasAlreadyOverdue && p.getStatus() == PaymentStatus.PAID)));
        if (!hasActiveOverdueFee) {
            BigDecimal overdueFee = calculateOverdueFee(contract);
            Payment feePayment = new Payment();
            feePayment.setCustomer(contract.getCustomer());
            feePayment.setReservation(contract.getReservation());
            feePayment.setRentalContract(contract);
            feePayment.setPaymentType(PaymentType.OVERDUE_FEE);
            feePayment.setAmount(overdueFee);
            feePayment.setStatus(PaymentStatus.PENDING);
            paymentRepository.save(feePayment);
        }
    }

    public BigDecimal calculateOverdueFee(RentalContract contract) {
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.OVERDUE, facilityId, unitTypeId);
        long daysOverdue = Math.max(1L, ChronoUnit.DAYS.between(contract.getEndDate(), LocalDate.now()));
        if (ruleOpt.isEmpty()) {
            return contract.getMonthlyPrice().multiply(BigDecimal.valueOf(10))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return contract.getMonthlyPrice().multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
            return rule.getAmount().multiply(BigDecimal.valueOf(daysOverdue))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return contract.getMonthlyPrice().multiply(BigDecimal.valueOf(10))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    public BigDecimal resolveRenewalMonthlyRate(RentalContract contract) {
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.RENEWAL, facilityId, unitTypeId);
        if (ruleOpt.isEmpty()) {
            return contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return contract.getMonthlyPrice().multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP);
    }

    private RentalContract findOrThrow(Integer id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Rental contract not found: " + id));
    }

    private void authorizeView(Users caller, RentalContract contract) {
        if (caller.getRole() == Role.CUSTOMER) {
            if (!caller.getId().equals(contract.getCustomer().getId())) {
                throw new BadRequestException("Rental contract is not yours");
            }
            return;
        }
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        }
    }

    private BigDecimal resolveMonthlyAmount(Long facilityId, Integer unitTypeId) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.RENTAL, facilityId, unitTypeId);
        if (ruleOpt.isEmpty() || ruleOpt.get().getAmount() == null) {
            return BigDecimal.valueOf(1000000).setScale(2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveDepositAmount(Reservation reservation, BigDecimal fullRentalAmount) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(
                PriceType.DEPOSIT,
                reservation.getFacility().getId(),
                reservation.getUnitType().getId());
        if (ruleOpt.isEmpty()) {
            return fullRentalAmount.multiply(BigDecimal.valueOf(50))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return fullRentalAmount.multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return fullRentalAmount.multiply(BigDecimal.valueOf(50))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    private Optional<PriceRule> findRuleGracefully(PriceType type, Long facilityId, Integer unitTypeId) {
        LocalDate today = LocalDate.now();
        List<PriceRule> rules = priceRuleRepository.findEffective(type, facilityId, unitTypeId, today);
        if (rules.isEmpty() && unitTypeId != null) {
            rules = priceRuleRepository.findEffective(type, facilityId, null, today);
        }
        if (rules.isEmpty() && facilityId != null) {
            rules = priceRuleRepository.findEffective(type, null, null, today);
        }
        return rules.isEmpty() ? Optional.empty() : Optional.of(rules.get(0));
    }

    private RentalContractResponse toResponse(RentalContract contract) {
        StorageUnit unit = contract.getStorageUnit();
        Reservation r = contract.getReservation();
        Facility facility = unit != null ? unit.getFacility() : (r != null ? r.getFacility() : null);
        UnitType unitType = unit != null ? unit.getUnitType() : (r != null ? r.getUnitType() : null);
        boolean isOverdue = contract.getStatus() == ContractStatus.OVERDUE
                || (contract.getStatus() == ContractStatus.ACTIVE
                && contract.getEndDate() != null
                && contract.getEndDate().isBefore(LocalDate.now()));

        Integer initialMonths = r != null && r.getRentalMonths() != null ? r.getRentalMonths() : 1;
        BigDecimal stage2Amount = r != null && r.getEstimatedAmount() != null
                ? r.getEstimatedAmount()
                : (contract.getMonthlyPrice() != null
                ? contract.getMonthlyPrice().multiply(BigDecimal.valueOf(initialMonths)).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO);

        boolean contractAlreadyActive = contract.getStatus() == ContractStatus.ACTIVE
                || contract.getStatus() == ContractStatus.OVERDUE
                || contract.getStatus() == ContractStatus.COMPLETED;

        boolean depPaid = contractAlreadyActive
                || (r != null && paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID))
                || paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        boolean rentPaid = contractAlreadyActive
                || (r != null && paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.RENTAL, PaymentStatus.PAID))
                || paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.RENTAL, PaymentStatus.PAID);

        return RentalContractResponse.builder()
                .id(contract.getId())
                .reservationId(r != null ? r.getId() : null)
                .customerId(contract.getCustomer().getId())
                .customerName(contract.getCustomer().getFullname())
                .facilityId(facility != null ? facility.getId() : null)
                .facilityName(facility != null ? facility.getName() : null)
                .unitTypeId(unitType != null ? unitType.getId() : null)
                .unitTypeName(unitType != null ? unitType.getTypeName() : null)
                .storageUnitId(unit != null ? unit.getId() : null)
                .unitCode(unit != null ? unit.getUnitCode() : null)
                .startDate(contract.getStartDate())
                .endDate(contract.getEndDate())
                .rentalMonths(initialMonths)
                .monthlyPrice(contract.getMonthlyPrice())
                .stage2RentalAmount(stage2Amount)
                .depositAmount(contract.getDepositAmount())
                .depositPaid(depPaid)
                .stage2RentalPaid(rentPaid)
                .status(contract.getStatus())
                .overdue(isOverdue)
                .signedAt(contract.getSignedAt())
                .signerName(contract.getSignerName())
                .signatureUrl(contract.getSignatureUrl())
                .createdAt(contract.getCreatedAt())
                .updatedAt(contract.getUpdatedAt())
                .build();
    }
}

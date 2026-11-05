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
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
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
    // Member 4: chuông thông báo khi hợp đồng quá hạn.
    private final OperationsNotificationService notifier;

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
        Optional<RentalContract> existing = contractRepository.findByReservation_Id(reservationId);
        if (existing.isPresent()) {
            throw new ConflictException("A rental contract already exists for this reservation");
        }

        BigDecimal monthlyPrice = resolveMonthlyAmount(
                reservation.getFacility().getId(), reservation.getUnitType().getId());
        BigDecimal depositAmount = resolveDepositAmount(reservation, monthlyPrice);

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
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<RentalContractResponse> mine() {
        Users customer = currentUserService.get();
        return contractRepository.findByCustomer_IdOrderByCreatedAtDesc(customer.getId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<RentalContractResponse> list(Long facilityId) {
        return list(facilityId, null);
    }

    @Transactional(readOnly = true)
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
            return all.stream().map(this::toResponse).toList();
        }
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, scope);
        }
        List<RentalContract> rows = status == null
                ? contractRepository.findByStorageUnit_Facility_IdOrderByCreatedAtDesc(scope)
                : contractRepository.findByStorageUnit_Facility_IdAndStatusOrderByCreatedAtDesc(scope, status);
        return rows.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public RentalContractResponse get(Integer id) {
        RentalContract contract = findOrThrow(id);
        authorizeView(currentUserService.get(), contract);
        return toResponse(contract);
    }

    /**
     * Ký hợp đồng điện tử (POST /api/rental-contracts/{id}/sign):
     * - Chỉ CUSTOMER là chủ hợp đồng được gọi.
     * - Chỉ cho ký khi hợp đồng đang PENDING.
     * - Nếu đã ký rồi (signedAt != null) thì trả 409 Conflict ("Contract already signed").
     * - Kiểm tra signatureUrl phải là ảnh hợp lệ (data URL base64 có magic bytes PNG/JPEG/GIF/WebP hoặc /api/files/<uuid>).
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
        String resolvedSigner = (request.getSignerName() != null && !request.getSignerName().isBlank())
                ? request.getSignerName().trim()
                : caller.getFullname();
        contract.setSignedAt(LocalDateTime.now());
        contract.setSignerName(resolvedSigner);
        contract.setSignatureUrl(trimmedSig);
        return toResponse(contractRepository.save(contract));
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
     * Luồng Renewal chuẩn theo đặc tả:
     * Customer request renewal -> BE lấy giá RENEWAL từ PriceRules -> Create Payment (PENDING).
     * Khách không được tự đặt paid=true khi tạo yêu cầu gia hạn; chỉ khi khoản thanh toán RENEWAL
     * được nhân viên/quản lý xác nhận PAID (qua PATCH /api/payments/{id}/paid) thì EndDate mới được cộng thêm tháng.
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
     * Chạy tự động theo lịch định kỳ và khi quản lý bấm nút quét trên FE.
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
     * Bắt buộc khách đã ký hợp đồng (signedAt != null) và đã thanh toán đủ cả Đợt 1 (DEPOSIT = PAID)
     * lẫn Đợt 2 (RENTAL = PAID, không còn khoản RENTAL nào đang PENDING).
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
        if (reservation.getStatus() == ReservationStatus.CONFIRMED) {
            reservation.setStatus(ReservationStatus.COMPLETED);
            reservationRepository.save(reservation);
        }
        return toResponse(contractRepository.save(contract));
    }

    /**
     * Hoàn tất hợp đồng (PATCH /api/rental-contracts/{id}/complete) — BR-56:
     * Bắt buộc đã có biên bản trả kho (UnitReturn), giải phóng StorageUnit nếu còn đang OCCUPIED,
     * và hoàn trả tiền đặt cọc (DEPOSIT -> REFUNDED).
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
        return toResponse(contractRepository.save(contract));
    }

    /**
     * Hoàn trả tiền cọc (DEPOSIT -> REFUNDED) khi khách trả kho / kết thúc hợp đồng bình thường.
     * Nếu có phí hư hại (damageFee > 0) thì khấu trừ vào tiền cọc hoàn lại.
     */
    @Transactional
    public void refundDepositOnReturn(RentalContract contract, BigDecimal damageFee) {
        if (contract == null) {
            return;
        }
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

    private void applyOverdueAndCreateFee(RentalContract contract) {
        contract.setStatus(ContractStatus.OVERDUE);
        contractRepository.save(contract);
        notifier.notifyUser(contract.getCustomer(), "Rental overdue", "Your rental is overdue",
                "Contract #" + contract.getId() + " ended on " + contract.getEndDate() + ". Please renew it or return the unit; "
                        + "an overdue fee has been issued.", "/account/contracts/" + contract.getId());

        boolean hasPendingOverdueFee = paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.OVERDUE_FEE, PaymentStatus.PENDING);
        if (!hasPendingOverdueFee) {
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

    private BigDecimal resolveDepositAmount(Reservation reservation, BigDecimal monthlyPrice) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(
                PriceType.DEPOSIT,
                reservation.getFacility().getId(),
                reservation.getUnitType().getId());
        if (ruleOpt.isEmpty()) {
            return monthlyPrice.multiply(BigDecimal.valueOf(50))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return monthlyPrice.multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return monthlyPrice.multiply(BigDecimal.valueOf(50))
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
        Facility facility = unit != null ? unit.getFacility() : contract.getReservation().getFacility();
        UnitType unitType = unit != null ? unit.getUnitType() : contract.getReservation().getUnitType();
        boolean isOverdue = contract.getStatus() == ContractStatus.OVERDUE
                || (contract.getStatus() == ContractStatus.ACTIVE
                && contract.getEndDate() != null
                && contract.getEndDate().isBefore(LocalDate.now()));

        return RentalContractResponse.builder()
                .id(contract.getId())
                .reservationId(contract.getReservation().getId())
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
                .monthlyPrice(contract.getMonthlyPrice())
                .depositAmount(contract.getDepositAmount())
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

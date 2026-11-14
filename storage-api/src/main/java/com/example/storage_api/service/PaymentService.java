package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PaymentResponse;
import com.example.storage_api.model.request.PaymentCreateRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PriceRuleRepository priceRuleRepository;
    private final AppointmentRepository appointmentRepository;
    private final CurrentUserService currentUserService;
    // Member 4: chuông thông báo cho từng khoản thanh toán.
    private final OperationsNotificationService notifier;
    private final AccountGuardService accountGuard;

    @Transactional(readOnly = true)
    public List<PaymentResponse> list(Long facilityId, PaymentStatus status, PaymentType paymentType) {
        Users caller = currentUserService.get();
        Long scopedFacility = facilityId;
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.FACILITY_MANAGER) {
            Long assigned = currentUserService.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(assigned)) {
                throw new BadRequestException("Bạn không có quyền truy cập cơ sở này");
            }
            scopedFacility = assigned;
        }
        final Long finalFacility = scopedFacility;
        return paymentRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(p -> {
                    if (finalFacility != null) {
                        Long pFac = extractFacilityId(p);
                        if (pFac == null || !pFac.equals(finalFacility)) {
                            return false;
                        }
                    }
                    if (status != null && p.getStatus() != status) {
                        return false;
                    }
                    if (paymentType != null && p.getPaymentType() != paymentType) {
                        return false;
                    }
                    if (caller.getRole() == Role.FACILITY_STAFF
                            && (p.getReservation() == null || !appointmentRepository
                            .existsByReservation_IdAndStaff_Id(p.getReservation().getId(), caller.getId()))) {
                        return false;
                    }
                    return true;
                })
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(Integer id) {
        Users user = currentUserService.get();
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        if (user.getRole() == Role.CUSTOMER) {
            assertCustomerOwns(user, payment.getCustomer());
        } else if (user.getRole() != Role.BUSINESS_MANAGER) {
            Long facilityId = extractFacilityId(payment);
            if (facilityId != null) {
                currentUserService.assertFacilityAccess(user, facilityId);
            }
        }
        return toResponse(payment);
    }

    // ===================== HÓA ĐƠN & HOÀN CỌC =====================

    private final com.example.storage_api.reponsitory.UnitReturnRepository unitReturnRepository;
    private final com.example.storage_api.reponsitory.SupportRequestRepository supportRequestRepository;
    private final ContractPreSignApplier preSignApplier;

    private static BigDecimal bd(String s) {
        try {
            return new BigDecimal(s.trim());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    /** Hóa đơn chi tiết của một khoản thu, để khách (và nhân viên) xem minh bạch từng dòng. */
    @Transactional(readOnly = true)
    public com.example.storage_api.model.reponse.InvoiceResponse invoice(Integer id) {
        get(id); // kiểm tra quyền xem giống xem khoản thu
        Payment p = paymentRepository.findById(id).orElseThrow();
        var lines = new java.util.ArrayList<com.example.storage_api.model.reponse.InvoiceResponse.Line>();
        var notes = new java.util.ArrayList<String>();
        var repairs = new java.util.ArrayList<String>();
        com.example.storage_api.model.reponse.InvoiceResponse.Refund refund = null;
        BigDecimal total = p.getAmount();
        String title;
        RentalContract contract = p.getRentalContract() != null ? p.getRentalContract()
                : (p.getReservation() != null ? rentalContractRepository.findByReservation_Id(p.getReservation().getId()).orElse(null) : null);
        Reservation r = p.getReservation();

        java.util.function.BiConsumer<String, BigDecimal> charge = (l, a) ->
                lines.add(com.example.storage_api.model.reponse.InvoiceResponse.Line.builder().label(l).amount(a).kind("CHARGE").build());
        java.util.function.BiConsumer<String, BigDecimal> deduct = (l, a) ->
                lines.add(com.example.storage_api.model.reponse.InvoiceResponse.Line.builder().label(l).amount(a.negate()).kind("DEDUCTION").build());

        switch (p.getPaymentType()) {
            case DEPOSIT -> {
                title = "Hóa đơn tiền đặt cọc (Đợt 1)";
                charge.accept("Tiền đặt cọc giữ kho"
                        + (r != null ? " (" + r.getRentalMonths() + " tháng)" : ""), p.getAmount());
                if (p.getRefundAmount() != null) {
                    title = "Hóa đơn tiền đặt cọc và hoàn cọc";
                    BigDecimal deducted = p.getDeductionAmount() == null ? BigDecimal.ZERO : p.getDeductionAmount();
                    if (p.getDeductionLines() != null) {
                        for (String ln : p.getDeductionLines().split(";")) {
                            int cut = ln.lastIndexOf('|');
                            if (cut > 0) {
                                String lbl = ln.substring(0, cut);
                                if (lbl.startsWith("+")) {
                                    charge.accept(lbl.substring(1), bd(ln.substring(cut + 1)));
                                } else {
                                    deduct.accept("Khấu trừ: " + lbl, bd(ln.substring(cut + 1)));
                                }
                            }
                        }
                    }
                    total = p.getRefundAmount();
                    refund = com.example.storage_api.model.reponse.InvoiceResponse.Refund.builder()
                            .depositPaid(p.getAmount()).deducted(deducted).refundAmount(p.getRefundAmount())
                            .transferred(p.getRefundedAt() != null).transferredAt(p.getRefundedAt())
                            .transferReference(p.getRefundTransferRef()).build();
                    notes.add(p.getRefundedAt() != null
                            ? "Công ty đã chuyển khoản hoàn " + p.getRefundAmount().toPlainString() + " VND về tài khoản bạn đã dùng để đóng cọc."
                            : "Khoản hoàn được công ty chuyển khoản về đúng tài khoản bạn đã dùng để đóng cọc, thường trong vòng 3 ngày làm việc (mã hoàn cọc: HC" + p.getId() + ").");
                }
            }
            case RENTAL -> {
                title = "Hóa đơn tiền thuê kho (Đợt 2)";
                if (r != null) {
                    BigDecimal monthly = r.getEstimatedAmount() == null || r.getRentalMonths() == null || r.getRentalMonths() == 0
                            ? p.getAmount() : r.getEstimatedAmount().divide(BigDecimal.valueOf(r.getRentalMonths()), 0, RoundingMode.HALF_UP);
                    charge.accept("Tiền thuê kho " + r.getRentalMonths() + " tháng × " + monthly.toPlainString() + " VND", p.getAmount());
                } else {
                    charge.accept("Tiền thuê kho", p.getAmount());
                }
            }
            case RENEWAL -> {
                title = "Hóa đơn gia hạn hợp đồng";
                charge.accept("Gia hạn thuê kho" + (p.getTransactionReference() != null && p.getTransactionReference().startsWith("RENEW_MONTHS:")
                        ? " " + p.getTransactionReference().substring(13) + " tháng" : ""), p.getAmount());
            }
            case OVERDUE_FEE -> {
                title = "Hóa đơn phí quá hạn";
                charge.accept("Phí lưu kho quá hạn (tính theo số ngày quá hạn)", p.getAmount());
                if ("TRU_VAO_COC".equals(p.getPaymentMethod())) {
                    notes.add("Khoản này đã được trừ trực tiếp vào tiền cọc của bạn.");
                }
            }
            case DAMAGE_FEE -> {
                title = "Hóa đơn phí hư hại";
                var ur = contract == null ? java.util.Optional.<UnitReturn>empty()
                        : unitReturnRepository.findFirstByRentalContract_Id(contract.getId());
                BigDecimal all = BigDecimal.ZERO;
                if (ur.isPresent() && ur.get().getDamageFeeBreakdown() != null) {
                    for (String part : ur.get().getDamageFeeBreakdown().split(",")) {
                        String[] kv = part.split("=");
                        if (kv.length == 2) {
                            charge.accept(damageLabel(kv[0].trim(), ur.get().getDamageDescription()), bd(kv[1]));
                            all = all.add(bd(kv[1]));
                        }
                    }
                }
                if (all.signum() == 0) {
                    all = p.getAmount();
                    charge.accept("Phí hư hại / đền bù", all);
                }
                BigDecimal coveredByDeposit = all.subtract(p.getAmount());
                if (coveredByDeposit.signum() > 0) {
                    deduct.accept("Đã trừ vào tiền cọc", coveredByDeposit);
                    lines.add(com.example.storage_api.model.reponse.InvoiceResponse.Line.builder()
                            .label("Tiền cọc còn lại sau khi trừ: 0 VND (phần vượt cọc khách thanh toán riêng)").amount(BigDecimal.ZERO).kind("INFO").build());
                }
                ur.ifPresent(u -> {
                    if (u.getDamageDescription() != null && !u.getDamageDescription().isBlank()) {
                        notes.add("Ghi nhận của nhân viên khi trả kho: " + u.getDamageDescription());
                    }
                    if (u.getNotes() != null && !u.getNotes().isBlank()) {
                        notes.add("Ghi chú của quản lý: " + u.getNotes());
                    }
                });
            }
            default -> {
                if (p.getTransactionReference() != null && p.getTransactionReference().startsWith(Stage2Schedule.LATE_FEE_MARK)) {
                    title = "Hóa đơn phí trễ hạn đóng tiền thuê (Đợt 2)";
                    charge.accept("Phí trễ hạn đóng tiền thuê Đợt 2 (tính theo số ngày trễ)", p.getAmount());
                    if ("TRU_VAO_COC".equals(p.getPaymentMethod())) {
                        notes.add("Khoản này đã được trừ trực tiếp vào tiền cọc của bạn.");
                    }
                } else if ("HUY_SOM".equals(p.getTransactionReference())) {
                    title = "Hóa đơn thanh toán khi hủy hợp đồng sớm";
                    charge.accept("Khoản còn phải trả khi hủy hợp đồng sớm (tiền thuê tháng đã dùng, phí phát sinh)", p.getAmount());
                } else {
                    title = "Hóa đơn phụ phí";
                    charge.accept("Phụ phí phát sinh", p.getAmount());
                }
            }
        }
        if (p.getTransactionReference() != null && p.getTransactionReference().startsWith("RENEW_MONTHS:") == false
                && !p.getTransactionReference().startsWith(Stage2Schedule.LATE_FEE_MARK)
                && !"HUY_SOM".equals(p.getTransactionReference())
                && p.getStatus() == PaymentStatus.PENDING) {
            notes.add("Mã tham chiếu: " + p.getTransactionReference());
        }
        if (contract != null) {
            for (SupportRequest sr : supportRequestRepository.findByRentalContract_IdOrderByCreatedAtAsc(contract.getId())) {
                repairs.add(sr.getTitle() + " (" + sr.getStatus().name().toLowerCase() + ")");
            }
        }
        Facility fac = p.getRentalContract() != null && p.getRentalContract().getStorageUnit() != null
                ? p.getRentalContract().getStorageUnit().getFacility()
                : (r != null ? r.getFacility() : null);
        String unitCode = contract != null && contract.getStorageUnit() != null ? contract.getStorageUnit().getUnitCode()
                : (r != null && r.getStorageUnit() != null ? r.getStorageUnit().getUnitCode() : null);
        LocalDateTime issued = p.getCreatedAt() != null ? p.getCreatedAt() : LocalDateTime.now();
        return com.example.storage_api.model.reponse.InvoiceResponse.builder()
                .paymentId(p.getId())
                .invoiceNumber("HD" + issued.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")) + "-" + String.format("%05d", p.getId()))
                .title(title)
                .paymentType(p.getPaymentType().name())
                .status(p.getStatus().name())
                .issuedAt(issued)
                .paidAt(p.getPaidAt())
                .waivedAt(p.getWaivedAt())
                .waivedReason(p.getWaivedReason())
                .paymentMethod(p.getPaymentMethod())
                .transactionReference(p.getTransactionReference())
                .customerName(p.getCustomer().getFullname())
                .customerEmail(p.getCustomer().getEmail())
                .facilityName(fac != null ? fac.getName() : null)
                .facilityAddress(fac != null ? fac.getAddress() : null)
                .unitCode(unitCode)
                .contractId(contract != null ? contract.getId() : null)
                .reservationId(r != null ? r.getId() : null)
                .lines(lines)
                .total(total)
                .notes(notes)
                .relatedRepairs(repairs)
                .refund(refund)
                .build();
    }

    /** Công ty đã chuyển khoản hoàn cọc thủ công cho khách: ghi lại thời điểm và mã giao dịch hoàn. */
    @Transactional
    public PaymentResponse markRefundTransferred(Integer id, String reference) {
        Users user = currentUserService.get();
        if (user.getRole() == Role.CUSTOMER || user.getRole() == Role.FACILITY_STAFF) {
            throw new AccessDeniedException("Chỉ quản lý mới xác nhận đã chuyển khoản hoàn cọc");
        }
        Payment p = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        Long facilityId = extractFacilityId(p);
        if (user.getRole() != Role.BUSINESS_MANAGER && user.getRole() != Role.SYSTEM_ADMIN && facilityId != null) {
            currentUserService.assertFacilityAccess(user, facilityId);
        }
        if (p.getRefundAmount() == null || p.getRefundAmount().signum() <= 0 || p.getStatus() != PaymentStatus.REFUNDED) {
            throw new ConflictException("Khoản này không có số tiền cần hoàn");
        }
        if (p.getRefundedAt() != null) {
            throw new ConflictException("Khoản hoàn này đã được chuyển trước đó");
        }
        p.setRefundedAt(LocalDateTime.now());
        p.setRefundTransferRef(blankToNull(reference));
        Payment saved = paymentRepository.save(p);
        notifier.notifyUser(p.getCustomer(), "Deposit refunded", "Đã chuyển khoản hoàn cọc",
                "Chúng tôi đã chuyển khoản hoàn " + String.format("%,.0f", p.getRefundAmount())
                        + " VND về tài khoản bạn đã dùng để đóng cọc. Bạn có thể xem hóa đơn hoàn cọc trong mục Thanh toán.",
                "/account/payments");
        return toResponse(saved);
    }

    /**
     * Miễn một khoản phí chưa thanh toán (phí quá hạn, phụ phí, phí hư hại) kèm lý do.
     * Khoản được miễn giữ trạng thái FAILED nhưng có WaivedAt, nên giao diện hiện "Đã miễn" và không tính vào doanh thu.
     */
    @Transactional
    public PaymentResponse waive(Integer id, String reason) {
        Users user = currentUserService.get();
        if (user.getRole() != Role.BUSINESS_MANAGER && user.getRole() != Role.FACILITY_MANAGER && user.getRole() != Role.SYSTEM_ADMIN) {
            throw new AccessDeniedException("Chỉ quản lý mới được miễn phí cho khách");
        }
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Vui lòng nhập lý do miễn phí");
        }
        Payment p = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        Long facilityId = extractFacilityId(p);
        if (user.getRole() == Role.FACILITY_MANAGER && facilityId != null) {
            currentUserService.assertFacilityAccess(user, facilityId);
        }
        PaymentType t = p.getPaymentType();
        if (t != PaymentType.OVERDUE_FEE && t != PaymentType.EXTRA_FEE && t != PaymentType.DAMAGE_FEE) {
            throw new ConflictException("Chỉ miễn được phí quá hạn, phụ phí hoặc phí hư hại");
        }
        if (p.getStatus() != PaymentStatus.PENDING) {
            throw new ConflictException("Chỉ miễn được khoản phí đang chờ thanh toán");
        }
        p.setStatus(PaymentStatus.FAILED);
        p.setWaivedAt(LocalDateTime.now());
        p.setWaivedBy(user.getFullname());
        p.setWaivedReason(reason.trim().length() > 500 ? reason.trim().substring(0, 500) : reason.trim());
        Payment saved = paymentRepository.save(p);
        String what = t == PaymentType.OVERDUE_FEE ? "phí quá hạn" : t == PaymentType.DAMAGE_FEE ? "phí hư hại" : "phụ phí";
        notifier.notifyUser(p.getCustomer(), "Khoản phí đã được miễn", "Khoản phí đã được miễn",
                "Khoản " + what + " " + String.format("%,.0f", p.getAmount()) + " VND của quý khách đã được miễn. Lý do: "
                        + saved.getWaivedReason() + ".", "/account/payments");
        return toResponse(saved);
    }

    @Transactional
    public PaymentResponse create(PaymentCreateRequest request) {
        Users caller = currentUserService.get();
        boolean isCustomer = caller.getRole() == Role.CUSTOMER;

        if (request.getTransactionReference() != null && request.getTransactionReference().length() > 150) {
            throw new BadRequestException("Mã giao dịch không được vượt quá 150 ký tự");
        }
        if (isCustomer && Boolean.TRUE.equals(request.getPaid())) {
            throw new BadRequestException("Khách hàng không thể tự đánh dấu đã thanh toán; khoản thu sẽ được ghi nhận khi tiền về hoặc nhân viên xác nhận");
        }

        Reservation reservation = null;
        RentalContract contract = null;
        if (request.getReservationId() != null) {
            reservation = reservationRepository.findById(request.getReservationId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Không tìm thấy đơn đặt kho: " + request.getReservationId()));
            if (isCustomer) {
                assertCustomerOwns(caller, reservation.getCustomer());
            } else {
                currentUserService.assertFacilityAccess(caller, reservation.getFacility().getId());
            }
        }
        if (request.getRentalContractId() != null) {
            contract = rentalContractRepository.findById(request.getRentalContractId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Không tìm thấy hợp đồng thuê kho: " + request.getRentalContractId()));
            if (isCustomer) {
                assertCustomerOwns(caller, contract.getCustomer());
            } else {
                currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
            }
        }
        if (reservation == null && contract == null) {
            throw new BadRequestException("Cần cung cấp đơn đặt kho hoặc hợp đồng");
        }
        if (reservation != null && contract != null
                && !contract.getReservation().getId().equals(reservation.getId())) {
            throw new BadRequestException("Đơn đặt kho và hợp đồng không khớp nhau");
        }

        PaymentType type = request.getPaymentType();
        if (isCustomer && (type == PaymentType.DAMAGE_FEE || type == PaymentType.EXTRA_FEE)) {
            throw new BadRequestException("Khoản " + type + " chỉ do nhân viên cơ sở lập, khách hàng không tự tạo được");
        }

        if (type == PaymentType.DEPOSIT || type == PaymentType.RENTAL) {
            if (reservation == null && contract != null) {
                reservation = contract.getReservation();
            }
            if (reservation == null) {
                throw new BadRequestException(type + " payments must reference a reservation");
            }
            if (reservation.getStatus() == ReservationStatus.CANCELLED) {
                throw new ConflictException("Không thể tạo khoản thu cho đơn đã hủy");
            }
            if (type == PaymentType.DEPOSIT
                    && paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                            reservation.getId(), type, PaymentStatus.PAID)) {
                throw new ConflictException("Đơn này đã đóng cọc");
            }
        } else if (contract == null) {
            if (reservation != null) {
                contract = rentalContractRepository.findByReservation_Id(reservation.getId()).orElse(null);
            }
            if (contract == null) {
                throw new BadRequestException(type + " payments must reference a rental contract");
            }
        }

        BigDecimal expected = resolveExpectedAmount(type, reservation, contract,
                isCustomer ? null : request.getAmount(), request.getRenewalMonths());

        if (request.getAmount() != null && request.getAmount().compareTo(expected) != 0) {
            throw new BadRequestException("Số tiền phải đúng bằng số tiền cần thanh toán: " + expected);
        }

        // Nếu đã có khoản PENDING cùng loại (DEPOSIT hoặc RENTAL) cho reservation này thì cập nhật và trả về
        if ((type == PaymentType.DEPOSIT || type == PaymentType.RENTAL) && reservation != null) {
            Optional<Payment> pendingExisting = paymentRepository
                    .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                            reservation.getId(), type, PaymentStatus.PENDING);
            if (pendingExisting.isPresent()) {
                Payment p = pendingExisting.get();
                p.setAmount(expected);
                if (request.getPaymentMethod() != null && !request.getPaymentMethod().isBlank()) {
                    p.setPaymentMethod(request.getPaymentMethod().trim());
                }
                if (request.getTransactionReference() != null && !request.getTransactionReference().isBlank()) {
                    p.setTransactionReference(request.getTransactionReference().trim());
                }
                boolean paid = !isCustomer && Boolean.TRUE.equals(request.getPaid());
                p.setStatus(paid ? PaymentStatus.PAID : PaymentStatus.PENDING);
                p.setPaidAt(paid ? LocalDateTime.now() : null);
                Payment saved = paymentRepository.save(p);
                if (paid) {
                    applyPaidSideEffects(saved, request.getRenewalMonths());
                }
                return toResponse(saved);
            }
        }

        Users targetCustomer = reservation != null ? reservation.getCustomer() : contract.getCustomer();
        Payment payment = new Payment();
        payment.setCustomer(targetCustomer);
        payment.setReservation(reservation != null ? reservation : contract.getReservation());
        payment.setRentalContract(contract);
        payment.setPaymentType(type);
        payment.setAmount(expected);
        payment.setPaymentMethod(blankToNull(request.getPaymentMethod()));
        String ref = blankToNull(request.getTransactionReference());
        if (type == PaymentType.RENEWAL && ref == null && request.getRenewalMonths() != null && request.getRenewalMonths() > 0) {
            ref = "RENEW_MONTHS:" + request.getRenewalMonths();
        }
        payment.setTransactionReference(ref);

        boolean paid = !isCustomer && Boolean.TRUE.equals(request.getPaid());
        payment.setStatus(paid ? PaymentStatus.PAID : PaymentStatus.PENDING);
        payment.setPaidAt(paid ? LocalDateTime.now() : null);

        Payment saved = paymentRepository.save(payment);
        if (paid) {
            applyPaidSideEffects(saved, request.getRenewalMonths());
        }
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> mine() {
        Users user = currentUserService.get();
        return paymentRepository.findByCustomer_IdOrderByCreatedAtDesc(user.getId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> listForContract(Integer contractId) {
        Users user = currentUserService.get();
        RentalContract contract = rentalContractRepository.findById(contractId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + contractId));
        authorizeFacilityOrOwner(user, contract);
        // Sao kê của hợp đồng gồm cả khoản cọc / tiền thuê gắn với đơn đặt kho lẫn các khoản gắn trực tiếp với hợp đồng
        // (gia hạn, phí quá hạn, phụ phí, phí hư hại), theo thứ tự thời gian.
        java.util.Map<Integer, Payment> merged = new java.util.LinkedHashMap<>();
        if (contract.getReservation() != null) {
            paymentRepository.findByReservation_IdOrderByCreatedAtDesc(contract.getReservation().getId())
                    .forEach(p -> merged.put(p.getId(), p));
        }
        paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contractId).forEach(p -> merged.put(p.getId(), p));
        return merged.values().stream()
                .sorted(java.util.Comparator.comparing(Payment::getCreatedAt, java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder()))
                        .thenComparing(Payment::getId))
                .map(this::toResponse).toList();
    }

    /** Tên hạng mục hư hại hiển thị trên hóa đơn (tiếng Việt, ghi rõ tình trạng). */
    private static String damageLabel(String key, String otherDescription) {
        return switch (key) {
            case "DOOR" -> "Cửa (hư hỏng, móp méo)";
            case "LOCK" -> "Khóa (hỏng, kẹt)";
            case "WALL_FLOOR" -> "Tường, sàn (hư hại)";
            case "ROOF_LEAK" -> "Mái (dột, rò nước)";
            case "LIGHT_ELECTRIC" -> "Đèn, điện (hỏng, chập)";
            case "KEY_LOST" -> "Chìa khóa (mất, chưa trả)";
            case "LEFT_ITEMS" -> "Đồ đạc, rác bỏ lại trong kho (chi phí dọn dẹp)";
            case "OTHER" -> otherDescription == null || otherDescription.isBlank()
                    ? "Hư hại khác" : "Hư hại khác: " + otherDescription.trim();
            default -> "Hư hại: " + key.replace('_', ' ').toLowerCase();
        };
    }

    /**
     * Khách hàng gửi phương thức thanh toán và mã tham chiếu chuyển khoản cho khoản thanh toán đang PENDING.
     * Khoản thanh toán vẫn giữ trạng thái PENDING cho tới khi nhân viên/quản lý xác nhận (BR-42).
     */
    @Transactional
    public PaymentResponse submitTransferReference(Integer id, String paymentMethod, String transactionReference) {
        Users user = currentUserService.get();
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        assertCustomerOwns(user, payment.getCustomer());
        if (payment.getStatus() != PaymentStatus.PENDING) {
            throw new ConflictException("Chỉ cập nhật được mã chuyển khoản cho khoản đang chờ thanh toán");
        }
        if (transactionReference != null && transactionReference.length() > 150) {
            throw new BadRequestException("Mã giao dịch không được vượt quá 150 ký tự");
        }
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            payment.setPaymentMethod(paymentMethod.trim());
        }
        if (transactionReference != null && !transactionReference.isBlank()
                && (payment.getTransactionReference() == null || !payment.getTransactionReference().startsWith("RENEW_MONTHS:"))) {
            payment.setTransactionReference(transactionReference.trim());
        }
        return toResponse(paymentRepository.save(payment));
    }

    /**
     * Giả lập cổng thanh toán online (VietQR / VNPay / MoMo) tự động báo thành công trên giao diện Demo.
     * Vẫn giữ nguyên khóa bảo mật BR-42 trên endpoint PATCH /api/payments/{id}/paid của Staff/Manager.
     */
    @Transactional
    public PaymentResponse simulateGatewayPayment(Integer id, String paymentMethod, String transactionReference) {
        return simulateGatewayPayment(id, paymentMethod, transactionReference, false);
    }

    @Transactional
    public PaymentResponse simulateGatewayPayment(Integer id, String paymentMethod, String transactionReference, boolean full) {
        Users user = currentUserService.get();
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        assertCustomerOwns(user, payment.getCustomer());
        if (payment.getStatus() == PaymentStatus.PAID) {
            throw new ConflictException("Khoản này đã được thanh toán");
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new ConflictException("Khoản đã hoàn tiền không thể đánh dấu đã thanh toán");
        }
        if (payment.getStatus() != PaymentStatus.PENDING) {
            throw new ConflictException("Chỉ khoản đang chờ thanh toán mới được xác nhận (hiện tại: " + payment.getStatus() + ")");
        }
        if (payment.getReservation() != null && payment.getReservation().getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Không thể thanh toán cho đơn đã hủy");
        }
        if (payment.getRentalContract() != null && payment.getRentalContract().getStatus() == ContractStatus.CANCELLED) {
            throw new ConflictException("Không thể thanh toán cho hợp đồng đã hủy");
        }
        if (transactionReference != null && transactionReference.length() > 150) {
            throw new BadRequestException("Mã giao dịch không được vượt quá 150 ký tự");
        }
        payment.setStatus(PaymentStatus.PAID);
        payment.setPaidAt(LocalDateTime.now());
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            payment.setPaymentMethod(paymentMethod.trim());
        } else if (payment.getPaymentMethod() == null) {
            payment.setPaymentMethod("BANK_TRANSFER");
        }
        if (transactionReference != null && !transactionReference.isBlank()
                && (payment.getTransactionReference() == null || !payment.getTransactionReference().startsWith("RENEW_MONTHS:"))) {
            payment.setTransactionReference(transactionReference.trim());
        }
        Payment saved = paymentRepository.save(payment);
        applyPaidSideEffects(saved, null);
        if (full) {
            payRentalIfCovered(saved, null, saved.getPaymentMethod(), null, true);
        }
        return toResponse(saved);
    }

    @org.springframework.beans.factory.annotation.Value("${app.payments.webhook-secret:demo-secret}")
    private String webhookSecret;

    @org.springframework.beans.factory.annotation.Value("${app.payments.sepay-key:ss-sepay-demo-key}")
    private String sepayKey;

    /** Xử lý webhook SePay: kiểm tra khóa, chỉ nhận tiền vào, khớp mã SS<id> và số tiền rồi tự PAID. */
    @Transactional
    public java.util.Map<String, Object> handleSepayWebhook(String authorization, java.util.Map<String, Object> body) {
        String given = authorization == null ? "" : authorization.replaceFirst("(?i)^\\s*Apikey\\s+", "").trim();
        if (!given.equals(sepayKey)) {
            throw new AccessDeniedException("Khóa API SePay không hợp lệ");
        }
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("success", true);
        String content = String.valueOf(body.getOrDefault("content", ""));
        if (!"in".equalsIgnoreCase(String.valueOf(body.getOrDefault("transferType", "in")))) {
            // Tiền ra: khớp mã hoàn cọc HC<id> trong nội dung để tự ghi nhận "đã chuyển hoàn".
            java.util.regex.Matcher hc = java.util.regex.Pattern.compile("HC\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE)
                    .matcher(content);
            result.put("matched", false);
            if (!hc.find()) {
                result.put("message", "Tiền ra không có mã hoàn cọc, bỏ qua");
                return result;
            }
            BigDecimal outAmount = new BigDecimal(String.valueOf(body.getOrDefault("transferAmount", "0")));
            String outRef = String.valueOf(body.getOrDefault("referenceCode", body.getOrDefault("id", "")));
            Payment dep = paymentRepository.findById(Integer.valueOf(hc.group(1))).orElse(null);
            if (dep == null || dep.getStatus() != PaymentStatus.REFUNDED || dep.getRefundAmount() == null
                    || dep.getRefundedAt() != null) {
                result.put("message", "Không có khoản hoàn cọc đang chờ khớp mã này");
                return result;
            }
            if (outAmount.compareTo(dep.getRefundAmount()) != 0) {
                result.put("message", "Số tiền chuyển ra không khớp số tiền cần hoàn " + dep.getRefundAmount());
                return result;
            }
            dep.setRefundedAt(LocalDateTime.now());
            dep.setRefundTransferRef(blankToNull(outRef));
            paymentRepository.save(dep);
            notifier.notifyUser(dep.getCustomer(), "Deposit refunded", "Đã chuyển khoản hoàn cọc",
                    "Chúng tôi đã chuyển khoản hoàn " + String.format("%,.0f", dep.getRefundAmount())
                            + " VND về tài khoản bạn đã dùng để đóng cọc. Bạn có thể xem hóa đơn hoàn cọc trong mục Thanh toán.",
                    "/account/payments");
            result.put("matched", true);
            result.put("paymentId", dep.getId());
            return result;
        }
        Object codeField = body.get("code");
        if (codeField != null && !String.valueOf(codeField).isBlank()) {
            content = content + " " + codeField;
        }
        BigDecimal amount = new BigDecimal(String.valueOf(body.getOrDefault("transferAmount", "0")));
        String txn = String.valueOf(body.getOrDefault("referenceCode", body.getOrDefault("id", "")));
        try {
            PaymentResponse paid = applyBankTransfer(webhookSecret, content, amount, txn);
            result.put("matched", true);
            result.put("paymentId", paid.getId());
        } catch (BadRequestException | ConflictException | ResourceNotFoundException e) {
            // Chuyển khoản không khớp khoản thu nào / thiếu tiền: ghi nhận cho nhân viên đối soát, không để SePay gửi lại.
            result.put("matched", false);
            result.put("message", e.getMessage());
        }
        return result;
    }

    /** Mã nội dung chuyển khoản của một khoản thu, ví dụ SS1005. */
    public static String transferCode(Integer paymentId) {
        return "SS" + paymentId;
    }

    /**
     * Ngân hàng báo có: tìm khoản thu theo mã SS<id> trong nội dung chuyển khoản, kiểm tra số tiền rồi tự động PAID.
     * Gọi lại với cùng giao dịch thì không đổi gì (idempotent).
     */
    @Transactional
    public PaymentResponse applyBankTransfer(String secret, String content, BigDecimal amount, String transactionId) {
        if (secret == null || !secret.equals(webhookSecret)) {
            throw new AccessDeniedException("Khóa webhook không hợp lệ");
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("SS\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(content == null ? "" : content);
        if (!m.find()) {
            throw new BadRequestException("Nội dung chuyển khoản không chứa mã thanh toán (SS...)");
        }
        Payment payment = paymentRepository.findById(Integer.valueOf(m.group(1)))
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thu " + m.group(1)));
        if (payment.getStatus() == PaymentStatus.PAID) {
            return toResponse(payment);
        }
        if (payment.getStatus() != PaymentStatus.PENDING) {
            throw new ConflictException("Khoản thu không còn ở trạng thái chờ thanh toán (" + payment.getStatus() + ")");
        }
        if (payment.getReservation() != null && payment.getReservation().getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Đơn đặt kho đã hủy, không nhận thanh toán");
        }
        if (amount == null || amount.compareTo(payment.getAmount()) < 0) {
            throw new ConflictException("Số tiền chuyển (" + amount + ") chưa đủ so với khoản thu " + payment.getAmount());
        }
        payment.setStatus(PaymentStatus.PAID);
        payment.setPaidAt(LocalDateTime.now());
        payment.setPaymentMethod("BANK_TRANSFER");
        if (transactionId != null && !transactionId.isBlank()
                && (payment.getTransactionReference() == null || !payment.getTransactionReference().startsWith("RENEW_MONTHS:"))) {
            payment.setTransactionReference(transactionId.trim());
        }
        Payment saved = paymentRepository.save(payment);
        applyPaidSideEffects(saved, null);
        payRentalIfCovered(saved, amount, "BANK_TRANSFER", transactionId, false);
        return toResponse(saved);
    }

    /**
     * Trả trọn gói: khách chuyển một lần đủ cả cọc (Đợt 1) và tiền thuê (Đợt 2) thì khoản Đợt 2 cũng được ghi nhận đã thanh toán.
     * force = true dùng cho nút giả lập (coi như đã chuyển đủ cả hai khoản).
     */
    private void payRentalIfCovered(Payment deposit, BigDecimal paidAmount, String method, String ref, boolean force) {
        if (deposit.getPaymentType() != PaymentType.DEPOSIT || deposit.getReservation() == null) {
            return;
        }
        paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                deposit.getReservation().getId(), PaymentType.RENTAL, PaymentStatus.PENDING).ifPresent(rental -> {
            if (!force && (paidAmount == null || paidAmount.compareTo(deposit.getAmount().add(rental.getAmount())) < 0)) {
                return;
            }
            rental.setStatus(PaymentStatus.PAID);
            rental.setPaidAt(LocalDateTime.now());
            rental.setPaymentMethod(method);
            if (ref != null && !ref.isBlank()) {
                rental.setTransactionReference(ref.trim());
            }
            Payment savedRental = paymentRepository.save(rental);
            applyPaidSideEffects(savedRental, null);
        });
    }

    /**
     * Xác nhận đã thu tiền (PATCH /api/payments/{id}/paid) — BR-42:
     * Chỉ nhân viên/quản lý/admin mới được xác nhận PAID; khách hàng (CUSTOMER) bị từ chối.
     */
    @Transactional
    public PaymentResponse markPaid(Integer id, String paymentMethod, String transactionReference) {
        Users user = currentUserService.get();
        if (user.getRole() == Role.CUSTOMER) {
            throw new AccessDeniedException("Khách hàng không được tự xác nhận đã thanh toán");
        }
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy khoản thanh toán: " + id));
        if (user.getRole() != Role.BUSINESS_MANAGER) {
            RentalContract contract = payment.getRentalContract();
            if (contract != null) {
                currentUserService.assertFacilityAccess(user, contract.getStorageUnit().getFacility().getId());
            } else if (payment.getReservation() != null) {
                currentUserService.assertFacilityAccess(user, payment.getReservation().getFacility().getId());
            } else {
                throw new BadRequestException("Khoản thu không thuộc cơ sở nào");
            }
        }
        if (payment.getStatus() == PaymentStatus.PAID) {
            throw new ConflictException("Khoản này đã được thanh toán");
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new ConflictException("Khoản đã hoàn tiền không thể đánh dấu đã thanh toán");
        }
        if (payment.getStatus() != PaymentStatus.PENDING) {
            throw new ConflictException("Chỉ khoản đang chờ thanh toán mới được xác nhận (hiện tại: " + payment.getStatus() + ")");
        }
        if (payment.getReservation() != null && payment.getReservation().getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Không thể thanh toán cho đơn đã hủy");
        }
        if (payment.getRentalContract() != null && payment.getRentalContract().getStatus() == ContractStatus.CANCELLED) {
            throw new ConflictException("Không thể thanh toán cho hợp đồng đã hủy");
        }
        payment.setStatus(PaymentStatus.PAID);
        payment.setPaidAt(LocalDateTime.now());
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            payment.setPaymentMethod(paymentMethod.trim());
        } else if (payment.getPaymentMethod() == null) {
            payment.setPaymentMethod("BANK_TRANSFER");
        }
        if (transactionReference != null && !transactionReference.isBlank()
                && (payment.getTransactionReference() == null || !payment.getTransactionReference().startsWith("RENEW_MONTHS:"))) {
            payment.setTransactionReference(transactionReference.trim());
        }
        Payment saved = paymentRepository.save(payment);
        applyPaidSideEffects(saved, null);
        return toResponse(saved);
    }

    /**
     * Xử lý tự động sau khi thanh toán thành công (PAID):
     * 1. DEPOSIT PAID (Đợt 1) + Reservation đã có kho -> Tự động tạo RentalContract (PENDING) và sinh hóa đơn Đợt 2 (RENTAL = 100% giá thuê).
     * 2. RENTAL PAID (Đợt 2) -> Nếu nhận kho trong vòng 10 ngày cuối trước hạn chót, khấu trừ 20% tiền cọc trong hợp đồng (khi đáo hạn hợp đồng hoàn lại 80% cọc).
     * 3. RENEWAL PAID -> Tự động cộng thêm tháng gia hạn vào RentalContract.EndDate và chuyển trạng thái về ACTIVE.
     */
    private void applyPaidSideEffects(Payment payment, Integer requestedMonths) {
        notifyPaid(payment);
        if (payment.getPaymentType() == PaymentType.DEPOSIT && payment.getCustomer() != null) {
            accountGuard.onDepositPaid(payment.getCustomer()); // đóng cọc thành công: xóa chuỗi đặt kho không thanh toán
        }
        if (payment.getPaymentType() == PaymentType.DEPOSIT && payment.getReservation() != null) {
            Reservation r = payment.getReservation();
            BigDecimal monthly = resolveMonthlyRental(r.getFacility().getId(), r.getUnitType().getId());
            BigDecimal fullRental = r.getEstimatedAmount() != null
                    ? r.getEstimatedAmount()
                    : monthly.multiply(BigDecimal.valueOf(r.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);

            RentalContract savedContract = null;
            if (r.getStorageUnit() != null
                    && (r.getStatus() == ReservationStatus.CONFIRMED || r.getStatus() == ReservationStatus.ASSIGNED)) {
                if (r.getStatus() == ReservationStatus.ASSIGNED) {
                    r.setStatus(ReservationStatus.CONFIRMED);
                    reservationRepository.save(r);
                }
                Optional<RentalContract> existing = rentalContractRepository.findByReservation_Id(r.getId());
                if (existing.isEmpty()) {
                    RentalContract contract = new RentalContract();
                    contract.setReservation(r);
                    contract.setCustomer(r.getCustomer());
                    contract.setStorageUnit(r.getStorageUnit());
                    contract.setStartDate(r.getStartDate());
                    contract.setEndDate(r.getStartDate().plusMonths(r.getRentalMonths()).minusDays(1));
                    contract.setMonthlyPrice(ContractPricing.lockedMonthlyPrice(r, monthly));
                    contract.setDepositAmount(payment.getAmount());
                    contract.setStatus(ContractStatus.PENDING);
                    preSignApplier.apply(contract);
                    savedContract = rentalContractRepository.save(contract);
                } else {
                    savedContract = existing.get();
                }
                payment.setRentalContract(savedContract);
                paymentRepository.save(payment);
                final RentalContract sc = savedContract;
                appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(r.getCustomer().getId()).stream()
                        .filter(a -> a.getReservation() != null && a.getReservation().getId().equals(r.getId()))
                        .forEach(a -> { a.setRentalContract(sc); appointmentRepository.save(a); });
            }

            // Tự động tạo hóa đơn Đợt 2 (RENTAL = 100% tiền thuê kho) ở trạng thái PENDING nếu chưa có
            boolean hasRentalInvoice = paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                    .anyMatch(p -> p.getPaymentType() == PaymentType.RENTAL);
            if (!hasRentalInvoice) {
                Payment stage2 = new Payment();
                stage2.setCustomer(r.getCustomer());
                stage2.setReservation(r);
                stage2.setRentalContract(savedContract);
                stage2.setPaymentType(PaymentType.RENTAL);
                stage2.setAmount(fullRental);
                stage2.setStatus(PaymentStatus.PENDING);
                stage2.setTransactionReference("DOT_2_THANH_TOAN_FULL_KHO");
                paymentRepository.save(stage2);
            }
        } else if (payment.getPaymentType() == PaymentType.RENTAL && payment.getReservation() != null) {
            // Đợt 2 đã thanh toán: không còn khấu trừ cọc theo "10 ngày cuối" (quy tắc hoàn cọc mới dựa trên số ngày giữ kho khi hủy).
        } else if (payment.getPaymentType() == PaymentType.RENEWAL && payment.getRentalContract() != null) {
            RentalContract contract = payment.getRentalContract();
            int months = resolveRenewalMonths(payment, requestedMonths, contract);
            LocalDate baseDate = contract.getEndDate().isBefore(LocalDate.now())
                    ? LocalDate.now().minusDays(1)
                    : contract.getEndDate();
            contract.setEndDate(baseDate.plusMonths(months));
            contract.setStatus(ContractStatus.ACTIVE);
            rentalContractRepository.save(contract);
        }
    }

    /** Mỗi khoản thanh toán thành công (từng đợt) là một thông báo cho khách. */
    private void notifyPaid(Payment p) {
        Users customer = p.getCustomer();
        if (customer == null || p.getPaymentType() == null) {
            return;
        }
        String amount = String.format("%,.0f", p.getAmount() == null ? BigDecimal.ZERO : p.getAmount()) + " VND";
        Reservation r = p.getReservation();
        RentalContract c = p.getRentalContract();
        String link = r != null ? "/account/reservations/" + r.getId()
                : c != null ? "/account/contracts/" + c.getId() : "/account/payments";
        String ref = r != null ? "đơn đặt kho #" + r.getId() : c != null ? "hợp đồng #" + c.getId() : "tài khoản của quý khách";
        switch (p.getPaymentType()) {
            case DEPOSIT -> notifier.notifyUser(customer, "Đã nhận tiền cọc", "Đã nhận tiền cọc Đợt 1",
                    "Chúng tôi đã nhận cọc " + amount + " cho " + ref + ". Kho của quý khách đang được giữ. "
                            + "Vui lòng điền hồ sơ thông tin hợp đồng (thông tin cá nhân, ảnh CCCD) trong mục Hợp đồng hoặc chi tiết đơn đặt kho, "
                            + "hoặc đến cơ sở gặp nhân viên để điền và ký trực tiếp. Tiền thuê (Đợt 2) quý khách có thể thanh toán bất kỳ lúc nào trước ngày nhận kho.", link);
            case RENTAL -> notifier.notifyUser(customer, "Đã nhận tiền thuê kho", "Đã nhận tiền thuê kho Đợt 2",
                    "Chúng tôi đã nhận tiền thuê " + amount + " cho " + ref
                            + ". Quý khách đến cơ sở đúng ngày giờ hẹn, nhân viên sẽ làm thủ tục nhận kho cho quý khách.", link);
            case RENEWAL -> notifier.notifyUser(customer, "Đã gia hạn hợp đồng", "Hợp đồng đã được gia hạn",
                    "Chúng tôi đã nhận phí gia hạn " + amount + " cho " + ref + ". Thời hạn thuê kho đã được kéo dài.", link);
            default -> notifier.notifyUser(customer, "Đã nhận thanh toán", "Đã nhận thanh toán",
                    "Chúng tôi đã nhận " + amount + " (" + (p.getPaymentType() == PaymentType.OVERDUE_FEE ? "phí quá hạn"
                            : p.getPaymentType() == PaymentType.DAMAGE_FEE ? "phí hư hại" : "phụ phí")
                            + ") cho " + ref + ".", link);
        }
    }

    private int resolveRenewalMonths(Payment payment, Integer requestedMonths, RentalContract contract) {
        if (requestedMonths != null && requestedMonths > 0) {
            return requestedMonths;
        }
        String ref = payment.getTransactionReference();
        if (ref != null && ref.startsWith("RENEW_MONTHS:")) {
            try {
                int parsed = Integer.parseInt(ref.substring("RENEW_MONTHS:".length()).trim());
                if (parsed > 0) {
                    return parsed;
                }
            } catch (NumberFormatException ignored) {
            }
        }
        if (contract.getMonthlyPrice() != null && contract.getMonthlyPrice().signum() > 0 && payment.getAmount() != null) {
            int estimated = payment.getAmount().divide(contract.getMonthlyPrice(), 0, RoundingMode.HALF_UP).intValue();
            if (estimated > 0) {
                return estimated;
            }
        }
        return 1;
    }

    private BigDecimal resolveExpectedAmount(PaymentType type, Reservation reservation,
                                             RentalContract contract, BigDecimal staffIssuedAmount,
                                             Integer renewalMonths) {
        if (type == PaymentType.DEPOSIT) {
            BigDecimal monthly = contract != null && contract.getMonthlyPrice() != null
                    ? contract.getMonthlyPrice()
                    : resolveMonthlyRental(reservation.getFacility().getId(), reservation.getUnitType().getId());
            BigDecimal fullRental = reservation.getEstimatedAmount() != null
                    ? reservation.getEstimatedAmount()
                    : monthly.multiply(BigDecimal.valueOf(reservation.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
            Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.DEPOSIT,
                    reservation.getFacility().getId(), reservation.getUnitType().getId());
            if (ruleOpt.isEmpty()) {
                return fullRental.multiply(BigDecimal.valueOf(50)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            return calculate(ruleOpt.get(), fullRental);
        }
        if (type == PaymentType.RENTAL) {
            // Đợt thuê khớp tổng tiền đã chốt lúc đặt chỗ (đã trừ khuyến mãi), không tính lại theo giá gốc.
            if (reservation.getEstimatedAmount() != null) {
                return reservation.getEstimatedAmount().setScale(2, RoundingMode.HALF_UP);
            }
            BigDecimal monthly = resolveMonthlyRental(
                    reservation.getFacility().getId(), reservation.getUnitType().getId());
            return monthly.multiply(BigDecimal.valueOf(reservation.getRentalMonths()))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        if (type == PaymentType.RENEWAL) {
            int months = renewalMonths != null && renewalMonths > 0 ? renewalMonths : 1;
            Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.RENEWAL, facilityId, unitTypeId);
            BigDecimal monthlyRate = ruleOpt.map(r -> calculate(r, contract.getMonthlyPrice()))
                    .orElseGet(() -> contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP));
            return monthlyRate.multiply(BigDecimal.valueOf(months)).setScale(2, RoundingMode.HALF_UP);
        }
        if (type == PaymentType.OVERDUE_FEE) {
            Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.OVERDUE, facilityId, unitTypeId);
            if (ruleOpt.isEmpty()) {
                return contract.getMonthlyPrice().multiply(BigDecimal.valueOf(10))
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            PriceRule rule = ruleOpt.get();
            if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
                long days = Math.max(1L, ChronoUnit.DAYS.between(contract.getEndDate(), LocalDate.now()));
                return rule.getAmount().multiply(BigDecimal.valueOf(days)).setScale(2, RoundingMode.HALF_UP);
            }
            return calculate(rule, contract.getMonthlyPrice());
        }
        if (type == PaymentType.EXTRA_FEE || type == PaymentType.DAMAGE_FEE) {
            if (staffIssuedAmount != null && staffIssuedAmount.signum() > 0) {
                return staffIssuedAmount.setScale(2, RoundingMode.HALF_UP);
            }
            PriceType pType = type == PaymentType.EXTRA_FEE ? PriceType.EXTRA_FEE : PriceType.DAMAGE_FEE;
            Optional<PriceRule> ruleOpt = findRuleGracefully(pType, facilityId, unitTypeId);
            if (ruleOpt.isPresent()) {
                return calculate(ruleOpt.get(), contract.getMonthlyPrice());
            }
            throw new BadRequestException("Vui lòng nhập số tiền cho khoản thu " + type);
        }
        throw new BadRequestException("Loại khoản thu không được hỗ trợ: " + type);
    }

    private BigDecimal resolveMonthlyRental(Long facilityId, Integer unitTypeId) {
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

    private BigDecimal calculate(PriceRule rule, BigDecimal base) {
        if (rule.getCalculationType() == CalculationType.PERCENTAGE) {
            if (base == null || rule.getPercentage() == null) {
                throw new BadRequestException("Giá theo phần trăm cần có số tiền gốc");
            }
            return base.multiply(rule.getPercentage()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        BigDecimal amount = rule.getAmount();
        if (amount == null) {
            throw new BadRequestException("Luật giá chưa có số tiền");
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return amount.multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    private Long extractFacilityId(Payment p) {
        if (p.getRentalContract() != null && p.getRentalContract().getStorageUnit() != null) {
            return p.getRentalContract().getStorageUnit().getFacility().getId();
        }
        if (p.getReservation() != null && p.getReservation().getFacility() != null) {
            return p.getReservation().getFacility().getId();
        }
        return null;
    }

    private void authorizeFacilityOrOwner(Users user, RentalContract contract) {
        if (user.getRole() == Role.CUSTOMER) {
            assertCustomerOwns(user, contract.getCustomer());
        } else if (user.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(user, contract.getStorageUnit().getFacility().getId());
        }
    }

    private void assertCustomerOwns(Users caller, Users owner) {
        if (!caller.getId().equals(owner.getId())) {
            throw new BadRequestException("Khoản thanh toán này không thuộc về khách hàng này");
        }
    }

    private PaymentResponse toResponse(Payment payment) {
        Facility facility = null;
        String unitCode = null;
        if (payment.getRentalContract() != null && payment.getRentalContract().getStorageUnit() != null) {
            facility = payment.getRentalContract().getStorageUnit().getFacility();
            unitCode = payment.getRentalContract().getStorageUnit().getUnitCode();
        } else if (payment.getReservation() != null) {
            facility = payment.getReservation().getFacility();
            if (payment.getReservation().getStorageUnit() != null) {
                unitCode = payment.getReservation().getStorageUnit().getUnitCode();
            }
        }

        return PaymentResponse.builder()
                .id(payment.getId())
                .transferCode(transferCode(payment.getId()))
                .customerId(payment.getCustomer().getId())
                .customerName(payment.getCustomer().getFullname())
                .reservationId(payment.getReservation() == null ? null : payment.getReservation().getId())
                .rentalContractId(payment.getRentalContract() == null ? null : payment.getRentalContract().getId())
                .facilityId(facility != null ? facility.getId() : null)
                .facilityName(facility != null ? facility.getName() : null)
                .unitCode(unitCode)
                .paymentType(payment.getPaymentType())
                .amount(payment.getAmount())
                .paymentMethod(payment.getPaymentMethod())
                .transactionReference(payment.getTransactionReference())
                .status(payment.getStatus())
                .paidAt(payment.getPaidAt())
                .createdAt(payment.getCreatedAt())
                .reservationStatus(payment.getReservation() == null ? null : payment.getReservation().getStatus().name())
                .refundAmount(payment.getRefundAmount())
                .deductionAmount(payment.getDeductionAmount())
                .refundedAt(payment.getRefundedAt())
                .refundTransferRef(payment.getRefundTransferRef())
                .waivedAt(payment.getWaivedAt())
                .waivedBy(payment.getWaivedBy())
                .waivedReason(payment.getWaivedReason())
                .build();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

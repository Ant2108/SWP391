package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.ReservationResponse;
import com.example.storage_api.model.request.ReservationCreateRequest;
import com.example.storage_api.reponsitory.*;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
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
public class ReservationService {
    private static final java.time.format.DateTimeFormatter NOTE_TIME =
            java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final PolicyService policyService;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final FacilityRepository facilityRepository;
    private final UnitTypeRepository unitTypeRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PriceRuleRepository priceRuleRepository;
    private final AppointmentRepository appointmentRepository;
    private final CurrentUserService currentUserService;
    private final AppointmentService appointmentService;
    private final OperationsNotificationService notifier;
    private final AccountGuardService accountGuard;
    private final ContractPreSignApplier preSignApplier;

    @Transactional
    public ReservationResponse create(ReservationCreateRequest request) {
        Users customer = currentUserService.get();
        accountGuard.requireAcknowledgement(customer, request.getAcknowledgedWarning());
        Facility facility = facilityRepository.findById(request.getFacilityId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy cơ sở: " + request.getFacilityId()));
        if (facility.getStatus() == FacilityStatus.INACTIVE) {
            throw new BadRequestException("Cơ sở hiện đang ngừng hoạt động");
        }
        UnitType type = unitTypeRepository.findById(request.getUnitTypeId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy loại kho: " + request.getUnitTypeId()));
        if (!type.getFacility().getId().equals(facility.getId()) || !type.isActive()) {
            throw new BadRequestException("Loại kho đã ngừng hoạt động hoặc không thuộc cơ sở này");
        }

        // Quy tắc thời gian thực: StartDate không được ở quá khứ và không được quá 1 tháng kể từ ngày đặt cọc hôm nay
        LocalDate today = LocalDate.now();
        var policy = policyService.get();
        LocalDate maxStartDate = today.plusMonths(policy.getMaxStartMonths());
        if (request.getRentalMonths() == null || request.getRentalMonths() < 1 || request.getRentalMonths() > policy.getMaxBookingMonths()) {
            throw new BadRequestException("Thời hạn thuê khi đặt kho chỉ được chọn từ 1 đến " + policy.getMaxBookingMonths() + " tháng. Muốn thuê thêm vui lòng gia hạn.");
        }
        if (request.getStartDate().isBefore(today)) {
            throw new BadRequestException("Ngày nhận kho không được ở quá khứ");
        }
        if (request.getStartDate().isAfter(maxStartDate)) {
            throw new BadRequestException("Ngày nhận kho không được quá " + policy.getMaxStartMonths() + " tháng kể từ ngày đặt cọc (tối đa: " + maxStartDate + ")");
        }

        java.time.LocalTime pickup = request.getPickupTime();
        if (pickup != null && (pickup.isBefore(java.time.LocalTime.of(9, 0)) || pickup.isAfter(java.time.LocalTime.of(17, 0)))) {
            throw new BadRequestException("Giờ nhận kho chỉ được chọn trong khoảng 09:00 - 17:00.");
        }
        if (pickup != null && request.getStartDate().equals(today) && pickup.isBefore(java.time.LocalTime.now())) {
            throw new BadRequestException("Giờ nhận kho hôm nay phải sau thời điểm hiện tại.");
        }

        // Mỗi buổi nhận kho cần một staff: khung giờ đã đủ staff thì yêu cầu khách dời giờ.
        int pickupMinutes = Integer.valueOf(60).equals(request.getPickupDurationMinutes()) ? 60 : 30;
        appointmentService.assertSlotAvailable(facility.getId(),
                request.getStartDate().atTime(pickup != null ? pickup : java.time.LocalTime.of(9, 0)), pickupMinutes);

        // Tự động hủy các đơn quá hạn 24h chưa thanh toán cọc trước khi kiểm tra tồn kho
        expireUnpaidOver24hReservations(facility.getId());

        // Chặn đặt quá số lượng kho còn trống
        int availableUnits = storageUnitRepository
                .search(facility.getId(), type.getId(), UnitStatus.AVAILABLE)
                .size();
        long unassignedPendingCount = reservationRepository
                .findByFacility_IdAndStatusOrderByCreatedAtDesc(facility.getId(), ReservationStatus.PENDING)
                .stream()
                .filter(existing -> existing.getUnitType().getId().equals(type.getId()) && existing.getStorageUnit() == null)
                .count();
        if (availableUnits <= 0 || unassignedPendingCount >= availableUnits) {
            throw new ConflictException("Loại kho '"
                    + type.getTypeName() + "' tại cơ sở này đã hết ô trống");
        }

        BigDecimal monthly = resolveMonthlyRentalPrice(facility.getId(), type.getId());
        // Tổng tiền thuê = giá tháng x số tháng, rồi trừ khuyến mãi (PriceType.DISCOUNT) đang có hiệu lực.
        BigDecimal fullRentalAmount = applyDiscount(
                monthly.multiply(BigDecimal.valueOf(request.getRentalMonths())).setScale(2, RoundingMode.HALF_UP),
                request.getRentalMonths(), facility.getId(), type.getId());

        Reservation r = new Reservation();
        r.setCustomer(customer);
        r.setFacility(facility);
        r.setUnitType(type);
        r.setStartDate(request.getStartDate());
        r.setRentalMonths(request.getRentalMonths());
        r.setEstimatedAmount(fullRentalAmount);
        r.setListMonthlyPrice(monthly);
        r.setStatus(ReservationStatus.PENDING);
        Reservation saved = reservationRepository.save(r);

        // Khởi tạo hóa đơn Đợt 1: Đặt cọc 50% tổng giá trị thuê kho (trạng thái PENDING / NOT_PAID, hạn 24h)
        ensureDepositPaymentExists(saved);
        appointmentService.createForReservation(saved, request.getPickupTime(), pickupMinutes);

        String link = "/account/reservations/" + saved.getId();
        notifier.notifyUser(customer, "Đã nhận đơn đặt kho", "Chúng tôi đã nhận đơn đặt kho của quý khách",
                "Đơn đặt kho #" + saved.getId() + " (" + type.getTypeName() + " tại " + facility.getName() + ") đã được tạo. "
                        + "Vui lòng đóng tiền cọc Đợt 1 trước " + saved.getCreatedAt().plusHours(policyService.get().getUnpaidHoldHours()).format(NOTE_TIME)
                        + " để giữ kho. Ngày nhận kho dự kiến: " + saved.getStartDate() + ".", link);
        notifier.notifyFacilityManagers(facility.getId(), "Đơn đặt kho mới", "Có đơn đặt kho mới",
                customer.getFullname() + " đã đặt một ô kho loại " + type.getTypeName() + " nhận từ ngày " + saved.getStartDate()
                        + ". Sau khi khách đóng cọc, vui lòng gán ô kho.", "/admin/reservations");
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> mine() {
        Users user = currentUserService.get();
        return reservationRepository.findByCustomer_IdOrderByCreatedAtDesc(user.getId())
                .stream().filter(r -> isVisibleTo(user, r)).map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ReservationResponse get(Integer id) {
        Users user = currentUserService.get();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + id));
        if (user.getRole() == Role.CUSTOMER) {
            if (!reservation.getCustomer().getId().equals(user.getId())) {
                throw new BadRequestException("Đơn đặt kho này không phải của bạn");
            }
        } else if (user.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(user, reservation.getFacility().getId());
        }
        return toResponse(reservation);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> list(Long facilityId, ReservationStatus status) {
        Users user = currentUserService.get();
        Long scopedFacility = facilityId;
        if (user.getRole() == Role.FACILITY_MANAGER || user.getRole() == Role.FACILITY_STAFF) {
            Long assigned = currentUserService.requireFacilityId(user);
            if (facilityId != null && !facilityId.equals(assigned)) {
                throw new BadRequestException("Bạn không có quyền truy cập cơ sở này");
            }
            scopedFacility = assigned;
        }
        if (scopedFacility == null) {
            List<Reservation> all = status == null
                    ? reservationRepository.findAllByOrderByCreatedAtDesc()
                    : reservationRepository.findByStatusOrderByCreatedAtDesc(status);
            return all.stream().filter(r -> isVisibleTo(user, r)).map(this::toResponse).toList();
        }
        if (user.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(user, scopedFacility);
        }
        List<Reservation> rows = status == null
                ? reservationRepository.findByFacility_IdOrderByCreatedAtDesc(scopedFacility)
                : reservationRepository.findByFacility_IdAndStatusOrderByCreatedAtDesc(scopedFacility, status);
        return rows.stream().filter(r -> isVisibleTo(user, r)).map(this::toResponse).toList();
    }

    /**
     * Ẩn đơn đã hủy khỏi giao diện: khách, staff, business manager sau 24 giờ; facility manager sau 15 ngày;
     * admin luôn thấy. Chỉ ẩn khi hiển thị, dữ liệu vẫn nằm trong database.
     */
    private boolean isVisibleTo(Users viewer, Reservation r) {
        // Staff chỉ thấy đơn của khách được manager gán cho mình.
        if (viewer.getRole() == Role.FACILITY_STAFF
                && !appointmentRepository.existsByReservation_IdAndStaff_Id(r.getId(), viewer.getId())) {
            return false;
        }
        if (r.getStatus() != ReservationStatus.CANCELLED || viewer.getRole() == Role.SYSTEM_ADMIN) {
            return true;
        }
        LocalDateTime since = r.getCancelledAt() != null ? r.getCancelledAt() : r.getUpdatedAt();
        if (since == null) {
            return true;
        }
        LocalDateTime limit = viewer.getRole() == Role.FACILITY_MANAGER
                ? since.plusDays(15) : since.plusHours(24);
        return LocalDateTime.now().isBefore(limit);
    }

    @Transactional
    public ReservationResponse assignUnit(Integer id, Integer unitId) {
        Users caller = currentUserService.get();
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.CUSTOMER) {
            throw new org.springframework.security.access.AccessDeniedException("Chỉ Quản lý cơ sở (Facility Manager) và Admin mới có quyền phân bổ ô kho");
        }
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + id));
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, r.getFacility().getId());
        }
        if (r.getStatus() == ReservationStatus.CANCELLED || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new ConflictException("Đơn đã hủy hoặc đã hoàn tất không thể gán ô kho");
        }
        // Chỉ gán ô sau khi khách đã đóng cọc Đợt 1.
        if (!paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
            throw new ConflictException("Khách chưa đóng cọc Đợt 1 nên chưa thể gán ô kho.");
        }
        StorageUnit unit = storageUnitRepository.findByIdForUpdate(unitId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy ô kho: " + unitId));
        if (!unit.getFacility().getId().equals(r.getFacility().getId())
                || !unit.getUnitType().getId().equals(r.getUnitType().getId())) {
            throw new BadRequestException("Ô kho không khớp với cơ sở và loại kho của đơn");
        }
        boolean sameUnit = r.getStorageUnit() != null && r.getStorageUnit().getId().equals(unit.getId());
        if (!sameUnit && unit.getStatus() != UnitStatus.AVAILABLE) {
            throw new ConflictException("Ô kho không còn trống");
        }
        if (r.getStorageUnit() != null && !sameUnit && r.getStorageUnit().getStatus() == UnitStatus.RESERVED) {
            r.getStorageUnit().setStatus(UnitStatus.AVAILABLE);
            storageUnitRepository.save(r.getStorageUnit());
        }
        unit.setStatus(UnitStatus.RESERVED);
        storageUnitRepository.save(unit);
        r.setStorageUnit(unit);
        r.setStatus(ReservationStatus.CONFIRMED);
        Reservation saved = reservationRepository.save(r);

        ensureDepositPaymentExists(saved);
        ensurePendingContractIfDepositPaid(saved);
        notifyUnitAssigned(saved);
        return toResponse(saved);
    }

    private void notifyUnitAssigned(Reservation r) {
        notifier.notifyUser(r.getCustomer(), "Đã gán ô kho cho quý khách", "Ô kho của quý khách đã được gán",
                "Ô kho " + r.getStorageUnit().getUnitCode() + " tại " + r.getFacility().getName()
                        + " đã được giữ cho quý khách. Ngày nhận kho: " + r.getStartDate()
                        + ". Quý khách vui lòng hoàn tất hồ sơ hợp đồng và thanh toán tiền thuê Đợt 2 trước ngày " + Stage2Schedule.dueDate(r).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")) + ".",
                "/account/reservations/" + r.getId());
    }

    /**
     * Hủy đặt chỗ & Hoàn tiền cọc ngay lập tức theo đúng quy tắc 10 ngày cuối / quá hạn:
     * - Hủy trước hạn nhận kho > 10 ngày: Hoàn trả 100% tiền cọc ngay lập tức.
     * - Hủy trong vòng 10 ngày cuối trước hạn: Khấu trừ 20% phí phạt, hoàn trả ngay 80% tiền cọc.
     * - Quá hạn nhận kho (> 1 tháng / quá ngày hạn): Mất 100% tiền cọc (hoàn 0đ).
     */
    @Transactional
    public ReservationResponse cancel(Integer id) {
        Users user = currentUserService.get();
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + id));
        if (user.getRole() == Role.CUSTOMER && !r.getCustomer().getId().equals(user.getId())) {
            throw new BadRequestException("Đơn đặt kho này không phải của bạn");
        }
        if (user.getRole() != Role.CUSTOMER) {
            currentUserService.assertFacilityAccess(user, r.getFacility().getId());
        }
        if (r.getStatus() == ReservationStatus.COMPLETED || r.getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Không thể hủy đơn đặt kho này");
        }
        Optional<RentalContract> contractOpt = rentalContractRepository.findByReservation_Id(r.getId());
        if (contractOpt.isPresent()) {
            RentalContract contract = contractOpt.get();
            if (contract.getStatus() == ContractStatus.ACTIVE || contract.getStatus() == ContractStatus.OVERDUE) {
                throw new ConflictException("Không thể hủy đơn đang có hợp đồng thuê còn hiệu lực");
            }
            if (contract.getStatus() == ContractStatus.PENDING) {
                contract.setStatus(ContractStatus.CANCELLED);
                rentalContractRepository.save(contract);
            }
        }

        // Xử lý hoàn tiền cọc ngay lập tức nếu khách đã thanh toán tiền cọc Đợt 1
        Optional<Payment> paidDepositOpt = paymentRepository
                .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        String refundMessage = "Chưa thanh toán khoản nào nên không có tiền cần hoàn.";
        if (paidDepositOpt.isPresent()) {
            Payment depositPayment = paidDepositOpt.get();
            BigDecimal originalDeposit = depositPayment.getAmount();
            BigDecimal refundRatio = calculateDepositRetentionRatio(r, LocalDate.now());
            BigDecimal refundAmount = originalDeposit.multiply(refundRatio).setScale(2, RoundingMode.HALF_UP);

            long heldDays = daysHeld(r, LocalDate.now());
            BigDecimal kept = originalDeposit.subtract(refundAmount);
            refundMessage = refundRatio.compareTo(BigDecimal.ZERO) > 0
                    ? "Kho đã được giữ " + heldDays + " ngày. Tiền cọc hoàn lại: " + String.format("%,.0f", refundAmount)
                    + " VND (khấu trừ " + String.format("%,.0f", kept) + " VND)."
                    : "Kho đã được giữ " + heldDays + " ngày nên khoản cọc không được hoàn lại.";
            depositPayment.setRefundAmount(refundAmount);
            depositPayment.setDeductionAmount(kept);
            depositPayment.setDeductionLines(kept.signum() > 0
                    ? "Phí giữ kho " + heldDays + " ngày (theo chính sách hủy)|" + kept.toPlainString() : null);
            if (refundRatio.compareTo(BigDecimal.ZERO) > 0) {
                depositPayment.setStatus(PaymentStatus.REFUNDED);
                depositPayment.setTransactionReference("HOAN_COC:" + refundAmount + "|KHAU_TRU:" + kept
                        + "|NGAY_GIU:" + heldDays);
            } else {
                depositPayment.setTransactionReference("MAT_COC:0.00|NGAY_GIU:" + heldDays);
            }
            paymentRepository.save(depositPayment);
        }

        // Hủy các khoản thanh toán đang PENDING của đơn này
        paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                .forEach(p -> {
                    p.setStatus(PaymentStatus.FAILED);
                    paymentRepository.save(p);
                });

        if (r.getStorageUnit() != null && r.getStorageUnit().getStatus() == UnitStatus.RESERVED) {
            r.getStorageUnit().setStatus(UnitStatus.AVAILABLE);
            storageUnitRepository.save(r.getStorageUnit());
        }
        r.setStatus(ReservationStatus.CANCELLED);
        r.setCancelledAt(LocalDateTime.now());
        appointmentService.cancelForReservation(r);
        notifier.notifyUser(r.getCustomer(), "Đơn đặt kho đã hủy", "Đơn đặt kho của quý khách đã được hủy",
                "Đơn đặt kho #" + r.getId() + " tại " + r.getFacility().getName() + " đã được hủy. " + refundMessage
                        + " Khoản hoàn (nếu có) được chuyển khoản về tài khoản quý khách đã dùng để đóng cọc trong vòng 3 ngày làm việc; "
                        + "nếu chưa nhận được, vui lòng liên hệ hỗ trợ.",
                "/account/reservations/" + r.getId());
        return toResponse(reservationRepository.save(r));
    }

    /**
     * Hủy hợp đồng vì khách trễ đóng tiền thuê Đợt 2 quá số ngày cho phép: thu hồi ô kho, hủy các khoản chưa thanh toán,
     * xử lý tiền cọc theo chính sách hủy (trừ phí trễ hạn đã tính nếu còn trong số tiền hoàn).
     */
    @Transactional
    public void terminateForUnpaidRental(Reservation r, long daysLate) {
        Optional<RentalContract> cOpt = rentalContractRepository.findByReservation_Id(r.getId());
        StorageUnit unit = r.getStorageUnit();
        if (cOpt.isPresent()) {
            RentalContract c = cOpt.get();
            if (c.getStatus() == ContractStatus.PENDING || c.getStatus() == ContractStatus.ACTIVE
                    || c.getStatus() == ContractStatus.OVERDUE) {
                c.setStatus(ContractStatus.CANCELLED);
                rentalContractRepository.save(c);
            }
            if (c.getStorageUnit() != null) {
                unit = c.getStorageUnit();
            }
        }
        // Thu hồi ô kho: ô đang có đồ của khách thì chuyển sang "đang kiểm tra" để nhân viên xử lý đồ trước khi cho thuê lại.
        boolean needsClearing = false;
        if (unit != null) {
            if (unit.getStatus() == UnitStatus.OCCUPIED) {
                unit.setStatus(UnitStatus.INSPECTION);
                needsClearing = true;
                storageUnitRepository.save(unit);
            } else if (unit.getStatus() == UnitStatus.RESERVED) {
                unit.setStatus(UnitStatus.AVAILABLE);
                storageUnitRepository.save(unit);
            }
        }

        // Tiền cọc theo chính sách hủy, rồi trừ phí trễ hạn đã tính nếu còn trong số tiền hoàn.
        BigDecimal feeOwed = BigDecimal.ZERO;
        java.util.List<Payment> lateFees = new java.util.ArrayList<>();
        for (Payment p : paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId())) {
            if (p.getStatus() == PaymentStatus.PENDING && p.getPaymentType() == PaymentType.EXTRA_FEE
                    && p.getTransactionReference() != null && p.getTransactionReference().startsWith(Stage2Schedule.LATE_FEE_MARK)) {
                lateFees.add(p);
                feeOwed = feeOwed.add(p.getAmount());
            }
        }
        String refundText = "Không có tiền cọc cần hoàn.";
        Optional<Payment> depOpt = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        if (depOpt.isPresent()) {
            Payment dep = depOpt.get();
            BigDecimal ratio = calculateDepositRetentionRatio(r, LocalDate.now());
            BigDecimal refund = dep.getAmount().multiply(ratio).setScale(2, RoundingMode.HALF_UP);
            long heldDays = daysHeld(r, LocalDate.now());
            java.util.List<String> lines = new java.util.ArrayList<>();
            BigDecimal keptByPolicy = dep.getAmount().subtract(refund);
            if (keptByPolicy.signum() > 0) {
                lines.add("Phí giữ kho " + heldDays + " ngày (theo chính sách hủy)|" + keptByPolicy.toPlainString());
            }
            BigDecimal deductedFees = BigDecimal.ZERO;
            for (Payment f : lateFees) {
                if (refund.compareTo(f.getAmount()) >= 0) {
                    refund = refund.subtract(f.getAmount());
                    deductedFees = deductedFees.add(f.getAmount());
                    f.setStatus(PaymentStatus.PAID);
                    f.setPaidAt(LocalDateTime.now());
                    f.setPaymentMethod("TRU_VAO_COC");
                    paymentRepository.save(f);
                    lines.add("Phí trễ hạn đóng tiền thuê Đợt 2|" + f.getAmount().toPlainString());
                }
            }
            BigDecimal kept = dep.getAmount().subtract(refund);
            dep.setRefundAmount(refund);
            dep.setDeductionAmount(kept);
            dep.setDeductionLines(lines.isEmpty() ? null : String.join(";", lines));
            if (refund.signum() > 0) {
                dep.setStatus(PaymentStatus.REFUNDED);
                dep.setTransactionReference("HOAN_COC:" + refund + "|KHAU_TRU:" + kept + "|NGAY_GIU:" + heldDays);
                refundText = "Tiền cọc hoàn lại: " + String.format("%,.0f", refund) + " VND (khấu trừ "
                        + String.format("%,.0f", kept) + " VND theo chính sách hủy và phí trễ hạn).";
            } else {
                dep.setTransactionReference("MAT_COC:0.00|NGAY_GIU:" + heldDays);
                refundText = "Tiền cọc không được hoàn lại theo chính sách hủy.";
            }
            paymentRepository.save(dep);
        }
        // Các khoản còn chờ thanh toán (tiền thuê Đợt 2, phí trễ hạn chưa trừ được) chuyển sang đã hủy.
        paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                .forEach(p -> {
                    p.setStatus(PaymentStatus.FAILED);
                    paymentRepository.save(p);
                });
        if (r.getStatus() != ReservationStatus.COMPLETED) {
            r.setStatus(ReservationStatus.CANCELLED);
        }
        r.setCancelledAt(LocalDateTime.now());
        reservationRepository.save(r);
        appointmentService.cancelForReservation(r);

        String unitCode = unit != null ? unit.getUnitCode() : "";
        notifier.notifyUser(r.getCustomer(), "Hợp đồng đã bị hủy do trễ đóng tiền thuê", "Hợp đồng thuê kho đã bị hủy",
                "Quý khách đã trễ hạn đóng tiền thuê Đợt 2 " + daysLate + " ngày nên hợp đồng ô " + unitCode
                        + " bị hủy và ô kho được thu hồi. " + refundText
                        + (needsClearing ? " Quý khách vui lòng liên hệ cơ sở để lấy đồ ra khỏi kho." : ""),
                "/account/contracts");
        notifier.notifyFacilityManagers(r.getFacility().getId(), "Hợp đồng bị hủy do trễ đóng tiền thuê",
                "Một hợp đồng bị hủy do khách trễ đóng tiền thuê",
                "Hợp đồng ô " + unitCode + " của khách " + r.getCustomer().getFullname() + " đã bị hủy vì trễ đóng tiền thuê Đợt 2 "
                        + daysLate + " ngày." + (needsClearing ? " Ô kho đang chờ kiểm tra và dọn đồ của khách." : ""),
                "/admin/reservations");
    }

    /**
     * Tính tỷ lệ tiền cọc còn được hoàn lại dựa trên thời điểm hiện tại so với hạn nhận kho:
     * - Trước hạn > 10 ngày: 100% (1.00)
     * - Trong vòng 10 ngày cuối trước hạn (0 <= daysUntilDeadline <= 10): 80% (0.80 - mất 20%)
     * - Quá hạn nhận kho (daysUntilDeadline < 0): 0% (0.00 - mất 100% cọc)
     */
    public BigDecimal calculateDepositRetentionRatio(Reservation r, LocalDate actionDate) {
        // Mốc ngày và tỉ lệ hoàn do Business Manager đặt (mặc định 10 / 20 / 25% / 30 ngày).
        return policyService.refundRatio(daysHeld(r, actionDate));
    }

    /** Số ngày kho đã được giữ kể từ lúc khách đóng cọc Đợt 1 (chưa đóng thì tính từ lúc đặt). */
    public long daysHeld(Reservation r, LocalDate actionDate) {
        LocalDate from = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)
                .map(Payment::getPaidAt)
                .map(LocalDateTime::toLocalDate)
                .orElseGet(() -> r.getCreatedAt() != null ? r.getCreatedAt().toLocalDate() : actionDate);
        return Math.max(0, ChronoUnit.DAYS.between(from, actionDate));
    }

    /**
     * Tự động chạy định kỳ mỗi 15 phút (900.000 ms) để hủy các đơn PENDING quá 24 giờ chưa thanh toán cọc
     * trên toàn hệ thống, không cần đợi có khách mới đặt kho mới kích hoạt.
     */
    @Scheduled(initialDelayString = "${app.reminders.initial-delay-ms:60000}", fixedDelayString = "${app.reminders.interval-ms:900000}")
    @Transactional
    public void expireAllUnpaidOver24hReservations() {
        expireUnpaidOver24hReservations(null);
    }

    /** Như trên nhưng trả về số đơn đã hủy (Member 4 dùng cho test và log). */
    @Transactional
    public int expireAllUnpaidReservations() {
        return expireUnpaidOver24hReservations(null);
    }

    private int expireUnpaidOver24hReservations(Long facilityId) {
        int cancelled = 0;
        int holdHours = policyService.get().getUnpaidHoldHours();
        LocalDateTime cutoff = LocalDateTime.now().minusHours(holdHours);
        // Quét cả đơn PENDING lẫn CONFIRMED/ASSIGNED (dữ liệu cũ) mà chưa có cọc PAID.
        List<Reservation> pendingList = new java.util.ArrayList<>();
        for (ReservationStatus st : List.of(ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.ASSIGNED)) {
            pendingList.addAll(facilityId != null
                    ? reservationRepository.findByFacility_IdAndStatusOrderByCreatedAtDesc(facilityId, st)
                    : reservationRepository.findByStatusOrderByCreatedAtDesc(st));
        }
        for (Reservation r : pendingList) {
            if (r.getCreatedAt() != null && r.getCreatedAt().isBefore(cutoff)) {
                boolean paid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
                if (!paid) {
                    if (r.getStorageUnit() != null && r.getStorageUnit().getStatus() == UnitStatus.RESERVED) {
                        r.getStorageUnit().setStatus(UnitStatus.AVAILABLE);
                        storageUnitRepository.save(r.getStorageUnit());
                    }
                    paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                            .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                            .forEach(p -> {
                                p.setStatus(PaymentStatus.FAILED);
                                paymentRepository.save(p);
                            });
                    r.setStatus(ReservationStatus.CANCELLED);
                    r.setCancelledAt(LocalDateTime.now());
                    reservationRepository.save(r);
                    appointmentService.cancelForReservation(r);
                    notifier.notifyUser(r.getCustomer(), "Đơn đặt kho đã tự động hủy", "Đơn đặt kho đã tự động hủy",
                            "Đơn đặt kho #" + r.getId() + " đã bị hủy vì quá " + holdHours + " giờ chưa đóng cọc Đợt 1. "
                                    + "Quý khách vẫn muốn thuê kho xin vui lòng đặt lại.", "/account/reservations/" + r.getId());
                    accountGuard.onUnpaidExpiry(r);
                    cancelled++;
                }
            }
        }
        return cancelled;
    }

    private void ensureDepositPaymentExists(Reservation r) {
        Optional<Payment> existing = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                r.getId(), PaymentType.DEPOSIT);
        if (existing.isPresent()) {
            return;
        }
        BigDecimal monthly = resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal fullRental = r.getEstimatedAmount() != null
                ? r.getEstimatedAmount()
                : monthly.multiply(BigDecimal.valueOf(r.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal deposit = resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly, fullRental);
        Payment payment = new Payment();
        payment.setCustomer(r.getCustomer());
        payment.setReservation(r);
        payment.setPaymentType(PaymentType.DEPOSIT);
        payment.setAmount(deposit);
        payment.setStatus(PaymentStatus.PENDING);
        paymentRepository.save(payment);
    }

    private void ensurePendingContractIfDepositPaid(Reservation r) {
        if (r.getStorageUnit() == null || r.getStatus() != ReservationStatus.CONFIRMED) {
            return;
        }
        Optional<RentalContract> existing = rentalContractRepository.findByReservation_Id(r.getId());
        if (existing.isPresent()) {
            RentalContract c = existing.get();
            if (!c.getStorageUnit().getId().equals(r.getStorageUnit().getId())) {
                c.setStorageUnit(r.getStorageUnit());
                c = rentalContractRepository.save(c);
            }
            syncAppointmentsWithContract(r, c);
            return;
        }
        BigDecimal monthly = resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal fullRental = r.getEstimatedAmount() != null
                ? r.getEstimatedAmount()
                : monthly.multiply(BigDecimal.valueOf(r.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal originalDeposit = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT)
                .map(Payment::getAmount)
                .orElseGet(() -> resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly, fullRental));

        // Khách nhận kho thì cọc được giữ nguyên, hoàn lại khi kết thúc hợp đồng (trừ phí phát sinh nếu có).
        BigDecimal refundableDeposit = originalDeposit.setScale(2, RoundingMode.HALF_UP);

        RentalContract contract = new RentalContract();
        contract.setReservation(r);
        contract.setCustomer(r.getCustomer());
        contract.setStorageUnit(r.getStorageUnit());
        contract.setStartDate(r.getStartDate());
        contract.setEndDate(r.getStartDate().plusMonths(r.getRentalMonths()).minusDays(1));
        contract.setMonthlyPrice(ContractPricing.lockedMonthlyPrice(r, monthly));
        contract.setDepositAmount(refundableDeposit);
        contract.setStatus(ContractStatus.PENDING);
        preSignApplier.apply(contract);
        RentalContract savedContract = rentalContractRepository.save(contract);
        syncAppointmentsWithContract(r, savedContract);

        // Khởi tạo sẵn Hóa đơn Đợt 2 (RENTAL = 100% tiền thuê kho) gắn với hợp đồng để khách thanh toán khi nhận kho
        boolean hasRentalPayment = !paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getPaymentType() == PaymentType.RENTAL)
                .toList().isEmpty();
        if (!hasRentalPayment) {
            Payment stage2Rental = new Payment();
            stage2Rental.setCustomer(r.getCustomer());
            stage2Rental.setReservation(r);
            stage2Rental.setRentalContract(savedContract);
            stage2Rental.setPaymentType(PaymentType.RENTAL);
            stage2Rental.setAmount(fullRental);
            stage2Rental.setStatus(PaymentStatus.PENDING);
            stage2Rental.setTransactionReference("DOT_2_THANH_TOAN_FULL_KHO");
            paymentRepository.save(stage2Rental);
        }
    }

    private void syncAppointmentsWithContract(Reservation r, RentalContract contract) {
        if (r == null || contract == null || r.getCustomer() == null) {
            return;
        }
        List<Appointment> appts = appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(r.getCustomer().getId());
        for (Appointment a : appts) {
            if (a.getReservation() != null && a.getReservation().getId().equals(r.getId())) {
                a.setRentalContract(contract);
                a.setFacility(r.getFacility());
                appointmentRepository.save(a);
            }
        }
    }

    public BigDecimal resolveMonthlyRentalPrice(Long facilityId, Integer unitTypeId) {
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

    /**
     * Trừ khuyến mãi đang hiệu lực (PriceType.DISCOUNT, rule cụ thể nhất thắng) khỏi tổng tiền thuê.
     *  - PERCENTAGE: giảm theo %.   - FIXED: giảm một lần.
     *  - PER_MONTH: giảm amount mỗi tháng thuê.   - PER_DAY: giảm amount x 30 ngày mỗi tháng thuê.
     * Không có rule thì giữ nguyên; kết quả không bao giờ âm.
     */
    public BigDecimal applyDiscount(BigDecimal total, int months, Long facilityId, Integer unitTypeId) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.DISCOUNT, facilityId, unitTypeId);
        if (ruleOpt.isEmpty()) {
            return total;
        }
        PriceRule rule = ruleOpt.get();
        BigDecimal off = BigDecimal.ZERO;
        if (rule.getCalculationType() == CalculationType.PERCENTAGE) {
            if (rule.getPercentage() != null) {
                off = total.multiply(rule.getPercentage()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
        } else if (rule.getAmount() != null) {
            off = switch (rule.getCalculationType()) {
                case PER_MONTH -> rule.getAmount().multiply(BigDecimal.valueOf(months));
                case PER_DAY -> rule.getAmount().multiply(BigDecimal.valueOf(30L * months));
                default -> rule.getAmount();
            };
        }
        return total.subtract(off).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    /** Báo giá cho trang đặt kho: dùng đúng các hàm tính tiền như lúc tạo đơn nên số hiển thị luôn khớp số phải trả. */
    @Transactional(readOnly = true)
    public com.example.storage_api.model.reponse.ReservationQuoteResponse quote(Long facilityId, Integer unitTypeId, int months) {
        int max = policyService.get().getMaxBookingMonths();
        if (months < 1 || months > max) {
            throw new BadRequestException("Thời hạn thuê khi đặt kho chỉ được chọn từ 1 đến " + max + " tháng.");
        }
        BigDecimal monthly = resolveMonthlyRentalPrice(facilityId, unitTypeId);
        BigDecimal listTotal = monthly.multiply(BigDecimal.valueOf(months)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = applyDiscount(listTotal, months, facilityId, unitTypeId);
        BigDecimal deposit = resolveDepositAmount(facilityId, unitTypeId, monthly, total);
        return new com.example.storage_api.model.reponse.ReservationQuoteResponse(
                monthly, months, listTotal, listTotal.subtract(total), total, deposit);
    }

    public BigDecimal resolveDepositAmount(Long facilityId, Integer unitTypeId, BigDecimal monthlyPrice) {
        return resolveDepositAmount(facilityId, unitTypeId, monthlyPrice, monthlyPrice);
    }

    /**
     * Đợt 1: tiền cọc = % tổng tiền thuê. Mặc định 50%; Business Manager có thể đặt chính sách % khác
     * bằng luật giá DEPOSIT theo phần trăm. Luật cọc số tiền cố định không còn được dùng.
     */
    public BigDecimal resolveDepositAmount(Long facilityId, Integer unitTypeId, BigDecimal monthlyPrice, BigDecimal fullRentalAmount) {
        BigDecimal percent = findRuleGracefully(PriceType.DEPOSIT, facilityId, unitTypeId)
                .filter(r -> r.getCalculationType() == CalculationType.PERCENTAGE && r.getPercentage() != null)
                .map(PriceRule::getPercentage)
                .orElse(BigDecimal.valueOf(50));
        return fullRentalAmount.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
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

    private ReservationResponse toResponse(Reservation r) {
        BigDecimal monthly = r.getRentalMonths() != null && r.getRentalMonths() > 0 && r.getEstimatedAmount() != null
                ? r.getEstimatedAmount().divide(BigDecimal.valueOf(r.getRentalMonths()), 2, RoundingMode.HALF_UP)
                : resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal fullRental = r.getEstimatedAmount() != null
                ? r.getEstimatedAmount()
                : monthly.multiply(BigDecimal.valueOf(r.getRentalMonths())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal depositAmount = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT)
                .map(Payment::getAmount)
                .orElseGet(() -> resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly, fullRental));

        BigDecimal retentionRatio = calculateDepositRetentionRatio(r, LocalDate.now());
        BigDecimal refundableDeposit = depositAmount.multiply(retentionRatio).setScale(2, RoundingMode.HALF_UP);

        // "Đã cọc" tính cả khoản cọc đã được hoàn (REFUNDED) vì khách từng đóng.
        boolean depositPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)
                || paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.REFUNDED);
        boolean stage2Paid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.RENTAL, PaymentStatus.PAID);

        Integer pendingDepositId = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PENDING)
                .map(Payment::getId)
                .orElse(null);
        Integer pendingRentalId = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.RENTAL, PaymentStatus.PENDING)
                .map(Payment::getId)
                .orElse(null);

        LocalDate baseDate = r.getCreatedAt() != null ? r.getCreatedAt().toLocalDate() : LocalDate.now();
        var pol = policyService.get();
        LocalDate maxHandoverDate = baseDate.plusMonths(pol.getMaxStartMonths());
        LocalDateTime paymentDeadline = (r.getCreatedAt() != null ? r.getCreatedAt() : LocalDateTime.now()).plusHours(pol.getUnpaidHoldHours());
        String paymentStatusLabel;
        if (r.getStatus() == ReservationStatus.CANCELLED) {
            paymentStatusLabel = "Đơn đã hủy";
        } else if (r.getStatus() == ReservationStatus.COMPLETED) {
            paymentStatusLabel = "Đã hoàn tất";
        } else if (depositPaid) {
            paymentStatusLabel = stage2Paid ? "Đã thanh toán đủ 2 đợt" : "Đã cọc Đợt 1 (50%) - Chờ Đợt 2";
        } else {
            paymentStatusLabel = "Chưa đóng cọc (hạn 24 giờ)";
        }

        Optional<RentalContract> contractOpt = rentalContractRepository.findByReservation_Id(r.getId());

        return ReservationResponse.builder()
                .id(r.getId())
                .customerId(r.getCustomer().getId())
                .customerName(r.getCustomer().getFullname())
                .facilityId(r.getFacility().getId())
                .facilityName(r.getFacility().getName())
                .unitTypeId(r.getUnitType().getId())
                .unitTypeName(r.getUnitType().getTypeName())
                .storageUnitId(r.getStorageUnit() == null ? null : r.getStorageUnit().getId())
                .unitCode(r.getStorageUnit() == null ? null : r.getStorageUnit().getUnitCode())
                .startDate(r.getStartDate())
                .maxHandoverDate(maxHandoverDate)
                .rentalDueDate(Stage2Schedule.dueDate(r))
                .rentalMonths(r.getRentalMonths())
                .estimatedAmount(fullRental)
                .depositAmount(depositAmount)
                .refundableDepositAmount(refundableDeposit)
                .stage2RentalAmount(fullRental)
                .depositPaid(depositPaid)
                .stage2RentalPaid(stage2Paid)
                .paymentStatusLabel(paymentStatusLabel)
                .paymentDeadline(paymentDeadline)
                .pendingDepositPaymentId(pendingDepositId)
                .pendingRentalPaymentId(pendingRentalId)
                .rentalContractId(contractOpt.map(RentalContract::getId).orElse(null))
                .contractStatus(contractOpt.map(RentalContract::getStatus).orElse(null))
                .status(r.getStatus())
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}

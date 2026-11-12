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

    @Transactional
    public ReservationResponse create(ReservationCreateRequest request) {
        Users customer = currentUserService.get();
        Facility facility = facilityRepository.findById(request.getFacilityId())
                .orElseThrow(() -> new ResourceNotFoundException("Facility not found: " + request.getFacilityId()));
        if (facility.getStatus() == FacilityStatus.INACTIVE) {
            throw new BadRequestException("Facility is currently inactive");
        }
        if (facility.getStockStatus() != null && facility.getStockStatus() != StockStatus.AVAILABLE) {
            throw new BadRequestException("Facility is not open for booking right now (" + facility.getStockStatus() + ")");
        }
        UnitType type = unitTypeRepository.findById(request.getUnitTypeId())
                .orElseThrow(() -> new ResourceNotFoundException("Unit type not found: " + request.getUnitTypeId()));
        if (!type.getFacility().getId().equals(facility.getId()) || !type.isActive()) {
            throw new BadRequestException("Unit type is inactive or does not belong to the facility");
        }

        // Quy tắc thời gian thực: StartDate không được ở quá khứ và không được quá 1 tháng kể từ ngày đặt cọc hôm nay
        LocalDate today = LocalDate.now();
        LocalDate maxStartDate = today.plusMonths(1);
        if (request.getRentalMonths() == null || request.getRentalMonths() < 1 || request.getRentalMonths() > 12) {
            throw new BadRequestException("Rental duration must be between 1 and 12 months");
        }
        if (request.getStartDate().isBefore(today)) {
            throw new BadRequestException("Start date cannot be in the past");
        }
        if (request.getStartDate().isAfter(maxStartDate)) {
            throw new BadRequestException("Start date cannot be more than 1 month from the deposit date (max: " + maxStartDate + ")");
        }

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
            throw new ConflictException("No available storage units remaining for unit type '"
                    + type.getTypeName() + "' at this facility");
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
        r.setStatus(ReservationStatus.PENDING);
        Reservation saved = reservationRepository.save(r);

        // Khởi tạo hóa đơn Đợt 1: Đặt cọc theo PriceRule hoặc mặc định 50% (trạng thái PENDING, hạn 24h)
        ensureDepositPaymentExists(saved);
        appointmentService.createForReservation(saved);

        String link = "/account/reservations/" + saved.getId();
        notifier.notifyUser(customer, "Reservation received", "We received your reservation",
                "Reservation #" + saved.getId() + " (" + type.getTypeName() + " at " + facility.getName() + ") is created. "
                        + "Please pay the deposit within 24 hours (before " + saved.getCreatedAt().plusHours(24).format(NOTE_TIME)
                        + ") to hold your unit. Pickup date: " + saved.getStartDate() + ".", link);
        notifier.notifyFacilityManagers(facility.getId(), "New reservation to review", "New reservation to review",
                customer.getFullname() + " reserved a " + type.getTypeName() + " unit from " + saved.getStartDate()
                        + ". Please assign a storage unit.", "/admin/reservations");
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> mine() {
        Users user = currentUserService.get();
        return reservationRepository.findByCustomer_IdOrderByCreatedAtDesc(user.getId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ReservationResponse get(Integer id) {
        Users user = currentUserService.get();
        Reservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        if (user.getRole() == Role.CUSTOMER) {
            if (!reservation.getCustomer().getId().equals(user.getId())) {
                throw new BadRequestException("Reservation is not yours");
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
                throw new BadRequestException("Facility access denied");
            }
            scopedFacility = assigned;
        }
        if (scopedFacility == null) {
            List<Reservation> all = status == null
                    ? reservationRepository.findAllByOrderByCreatedAtDesc()
                    : reservationRepository.findByStatusOrderByCreatedAtDesc(status);
            return all.stream().map(this::toResponse).toList();
        }
        if (user.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(user, scopedFacility);
        }
        List<Reservation> rows = status == null
                ? reservationRepository.findByFacility_IdOrderByCreatedAtDesc(scopedFacility)
                : reservationRepository.findByFacility_IdAndStatusOrderByCreatedAtDesc(scopedFacility, status);
        return rows.stream().map(this::toResponse).toList();
    }

    @Transactional
    public ReservationResponse assignUnit(Integer id, Integer unitId) {
        Users caller = currentUserService.get();
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.CUSTOMER) {
            throw new org.springframework.security.access.AccessDeniedException("Only facility managers and system admins can assign storage units");
        }
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, r.getFacility().getId());
        }
        if (r.getStatus() == ReservationStatus.CANCELLED || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new ConflictException("Cancelled or completed reservation cannot be assigned");
        }
        StorageUnit unit = storageUnitRepository.findByIdForUpdate(unitId)
                .orElseThrow(() -> new ResourceNotFoundException("Storage unit not found: " + unitId));
        if (!unit.getFacility().getId().equals(r.getFacility().getId())
                || !unit.getUnitType().getId().equals(r.getUnitType().getId())) {
            throw new BadRequestException("Unit does not match reservation facility and type");
        }
        boolean sameUnit = r.getStorageUnit() != null && r.getStorageUnit().getId().equals(unit.getId());
        if (!sameUnit) {
            Optional<RentalContract> existingContractOpt = rentalContractRepository.findByReservation_Id(r.getId());
            if (existingContractOpt.isPresent()) {
                RentalContract existingContract = existingContractOpt.get();
                if (existingContract.getSignedAt() != null
                        || existingContract.getStatus() == ContractStatus.ACTIVE
                        || existingContract.getStatus() == ContractStatus.OVERDUE) {
                    throw new ConflictException("Cannot change storage unit after the contract has been signed or activated");
                }
            }
        }
        if (!sameUnit && unit.getStatus() != UnitStatus.AVAILABLE) {
            throw new ConflictException("Storage unit is not available");
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
        notifier.notifyUser(r.getCustomer(), "Storage unit assigned", "Your storage unit is assigned",
                "Unit " + r.getStorageUnit().getUnitCode() + " at " + r.getFacility().getName()
                        + " is held for you. Pickup date: " + r.getStartDate() + ".",
                "/account/reservations/" + r.getId());
    }

    @Transactional
    public ReservationResponse confirm(Integer id) {
        Users caller = currentUserService.get();
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.CUSTOMER) {
            throw new org.springframework.security.access.AccessDeniedException("Only facility managers and system admins can confirm reservations");
        }
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, r.getFacility().getId());
        }
        if (r.getStatus() == ReservationStatus.CANCELLED || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new ConflictException("Cancelled or completed reservation cannot be confirmed");
        }
        if (r.getStorageUnit() == null) {
            List<StorageUnit> available = storageUnitRepository.search(
                    r.getFacility().getId(), r.getUnitType().getId(), UnitStatus.AVAILABLE);
            if (available.isEmpty()) {
                throw new BadRequestException("Please assign an available storage unit before confirming");
            }
            StorageUnit unit = storageUnitRepository.findByIdForUpdate(available.get(0).getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Storage unit not found"));
            if (unit.getStatus() != UnitStatus.AVAILABLE) {
                throw new ConflictException("Storage unit is not available");
            }
            unit.setStatus(UnitStatus.RESERVED);
            storageUnitRepository.save(unit);
            r.setStorageUnit(unit);
        }
        r.setStatus(ReservationStatus.CONFIRMED);
        Reservation saved = reservationRepository.save(r);

        ensureDepositPaymentExists(saved);
        ensurePendingContractIfDepositPaid(saved);
        notifyUnitAssigned(saved);
        return toResponse(saved);
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
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        if (user.getRole() == Role.CUSTOMER && !r.getCustomer().getId().equals(user.getId())) {
            throw new BadRequestException("Reservation is not yours");
        }
        if (user.getRole() != Role.CUSTOMER) {
            currentUserService.assertFacilityAccess(user, r.getFacility().getId());
        }
        if (r.getStatus() == ReservationStatus.COMPLETED || r.getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Reservation cannot be cancelled");
        }
        Optional<RentalContract> contractOpt = rentalContractRepository.findByReservation_Id(r.getId());
        if (contractOpt.isPresent()) {
            RentalContract contract = contractOpt.get();
            if (contract.getStatus() == ContractStatus.ACTIVE || contract.getStatus() == ContractStatus.OVERDUE) {
                throw new ConflictException("Cannot cancel reservation with an active rental contract");
            }
            if (contract.getStatus() == ContractStatus.PENDING) {
                contract.setStatus(ContractStatus.CANCELLED);
                rentalContractRepository.save(contract);
                paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contract.getId()).stream()
                        .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                        .forEach(p -> {
                            p.setStatus(PaymentStatus.FAILED);
                            paymentRepository.save(p);
                        });
            }
        }

        // Xử lý hoàn tiền cọc ngay lập tức nếu khách đã thanh toán tiền cọc Đợt 1
        Optional<Payment> paidDepositOpt = paymentRepository
                .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        String refundMessage = "No payment had been made, so nothing is refunded.";
        if (paidDepositOpt.isPresent()) {
            Payment depositPayment = paidDepositOpt.get();
            BigDecimal originalDeposit = depositPayment.getAmount();
            BigDecimal refundRatio = calculateDepositRetentionRatio(r, LocalDate.now());
            BigDecimal refundAmount = originalDeposit.multiply(refundRatio).setScale(2, RoundingMode.HALF_UP);

            refundMessage = refundRatio.compareTo(BigDecimal.ZERO) > 0
                    ? "Your deposit refund: " + String.format("%,.0f", refundAmount) + " VND."
                    : "The deposit is not refundable because the pickup deadline has passed.";
            if (refundRatio.compareTo(BigDecimal.ZERO) > 0) {
                depositPayment.setStatus(PaymentStatus.REFUNDED);
                String refundNote = refundRatio.compareTo(BigDecimal.ONE) == 0
                        ? "HOAN_COC_100%:" + refundAmount
                        : "HOAN_COC_80%_TRU_20%_PHI:" + refundAmount;
                depositPayment.setTransactionReference(refundNote);
            } else {
                depositPayment.setTransactionReference("MAT_100%_COC_DO_QUA_HAN:0.00");
            }
            paymentRepository.save(depositPayment);
        }

        // Nếu khách đã đóng trước cả tiền thuê Đợt 2 (RENTAL = PAID) trước khi hủy đơn thì hoàn trả 100% tiền thuê Đợt 2
        paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getPaymentType() == PaymentType.RENTAL && p.getStatus() == PaymentStatus.PAID)
                .forEach(p -> {
                    p.setStatus(PaymentStatus.REFUNDED);
                    p.setTransactionReference("HOAN_100%_TIEN_THUE_DOT_2:" + p.getAmount());
                    paymentRepository.save(p);
                });

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
        appointmentService.cancelForReservation(r);
        notifier.notifyUser(r.getCustomer(), "Reservation cancelled", "Your reservation was cancelled",
                "Reservation #" + r.getId() + " at " + r.getFacility().getName() + " is cancelled. " + refundMessage
                        + " Refunds are processed within 3 days; if you do not see it, please contact support.",
                "/account/reservations/" + r.getId());
        return toResponse(reservationRepository.save(r));
    }

    /**
     * Tính tỷ lệ tiền cọc còn được hoàn lại dựa trên thời điểm hiện tại so với hạn nhận kho:
     * - Trước hạn > 10 ngày: 100% (1.00)
     * - Trong vòng 10 ngày cuối trước hạn (0 <= daysUntilDeadline <= 10): 80% (0.80 - mất 20%)
     * - Quá hạn nhận kho (daysUntilDeadline < 0): 0% (0.00 - mất 100% cọc)
     */
    public BigDecimal calculateDepositRetentionRatio(Reservation r, LocalDate actionDate) {
        LocalDate depositBaseDate = r.getCreatedAt() != null ? r.getCreatedAt().toLocalDate() : LocalDate.now();
        LocalDate maxDeadline = depositBaseDate.plusMonths(1);
        LocalDate effectiveDeadline = r.getStartDate() != null && r.getStartDate().isBefore(maxDeadline)
                ? maxDeadline
                : (r.getStartDate() != null ? r.getStartDate() : maxDeadline);
        long daysUntilDeadline = ChronoUnit.DAYS.between(actionDate, effectiveDeadline);
        if (daysUntilDeadline < 0) {
            return BigDecimal.ZERO;
        }
        if (daysUntilDeadline <= 10) {
            return new BigDecimal("0.80");
        }
        return BigDecimal.ONE;
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
        LocalDateTime cutoff = LocalDateTime.now().minusHours(24);
        List<Reservation> pendingList = facilityId != null
                ? reservationRepository.findByFacility_IdAndStatusOrderByCreatedAtDesc(facilityId, ReservationStatus.PENDING)
                : reservationRepository.findByStatusOrderByCreatedAtDesc(ReservationStatus.PENDING);
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
                    reservationRepository.save(r);
                    appointmentService.cancelForReservation(r);
                    notifier.notifyUser(r.getCustomer(), "Reservation expired", "Your reservation expired",
                            "Reservation #" + r.getId() + " was cancelled because the deposit was not paid within 24 hours. "
                                    + "You can book again anytime.", "/account/reservations/" + r.getId());
                    cancelled++;
                }
            }
        }
        return cancelled;
    }

    public void ensureDepositPaymentExists(Reservation r) {
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
        boolean depositPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        if (!depositPaid) {
            return;
        }

        Optional<RentalContract> existing = rentalContractRepository.findByReservation_Id(r.getId());
        if (existing.isPresent()) {
            RentalContract c = existing.get();
            if (!c.getStorageUnit().getId().equals(r.getStorageUnit().getId())) {
                c.setStorageUnit(r.getStorageUnit());
                c = rentalContractRepository.save(c);
            }
            linkReservationPaymentsToContract(r, c);
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

        // Nếu nhận kho trong vòng 10 ngày cuối trước hạn thì khấu trừ 20% tiền cọc, khi hết hạn hợp đồng hoàn lại 80%
        BigDecimal retentionRatio = calculateDepositRetentionRatio(r, LocalDate.now());
        BigDecimal refundableDeposit = originalDeposit.multiply(retentionRatio).setScale(2, RoundingMode.HALF_UP);

        RentalContract contract = new RentalContract();
        contract.setReservation(r);
        contract.setCustomer(r.getCustomer());
        contract.setStorageUnit(r.getStorageUnit());
        contract.setStartDate(r.getStartDate());
        contract.setEndDate(r.getStartDate().plusMonths(r.getRentalMonths()).minusDays(1));
        contract.setMonthlyPrice(monthly);
        contract.setDepositAmount(refundableDeposit);
        contract.setStatus(ContractStatus.PENDING);
        RentalContract savedContract = rentalContractRepository.save(contract);
        syncAppointmentsWithContract(r, savedContract);

        // Khởi tạo sẵn Hóa đơn Đợt 2 (RENTAL = 100% tiền thuê kho) gắn với hợp đồng để khách thanh toán khi nhận kho
        boolean hasRentalPayment = paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .anyMatch(p -> p.getPaymentType() == PaymentType.RENTAL);
        if (!hasRentalPayment) {
            Payment stage2Rental = new Payment();
            stage2Rental.setCustomer(r.getCustomer());
            stage2Rental.setReservation(r);
            stage2Rental.setRentalContract(savedContract);
            stage2Rental.setPaymentType(PaymentType.RENTAL);
            stage2Rental.setAmount(fullRental);
            stage2Rental.setStatus(PaymentStatus.PENDING);
            paymentRepository.save(stage2Rental);
        }
        linkReservationPaymentsToContract(r, savedContract);
    }

    private void linkReservationPaymentsToContract(Reservation r, RentalContract contract) {
        if (r == null || contract == null) {
            return;
        }
        paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getRentalContract() == null)
                .forEach(p -> {
                    p.setRentalContract(contract);
                    paymentRepository.save(p);
                });
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

    public BigDecimal resolveDepositAmount(Long facilityId, Integer unitTypeId, BigDecimal monthlyPrice) {
        return resolveDepositAmount(facilityId, unitTypeId, monthlyPrice, monthlyPrice);
    }

    /**
     * Đợt 1: Nếu có PriceRule DEPOSIT riêng thì lấy theo PriceRule, nếu không có thì mặc định 50% tổng giá trị thuê kho.
     */
    public BigDecimal resolveDepositAmount(Long facilityId, Integer unitTypeId, BigDecimal monthlyPrice, BigDecimal fullRentalAmount) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.DEPOSIT, facilityId, unitTypeId);
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

        Optional<RentalContract> contractOpt = rentalContractRepository.findByReservation_Id(r.getId());
        boolean contractAlreadyActive = contractOpt.isPresent()
                && (contractOpt.get().getStatus() == ContractStatus.ACTIVE
                || contractOpt.get().getStatus() == ContractStatus.OVERDUE
                || contractOpt.get().getStatus() == ContractStatus.COMPLETED);

        boolean depositPaid = contractAlreadyActive
                || paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        boolean stage2Paid = contractAlreadyActive
                || paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
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
        LocalDate maxHandoverDate = baseDate.plusMonths(1);
        LocalDateTime paymentDeadline = (r.getCreatedAt() != null ? r.getCreatedAt() : LocalDateTime.now()).plusHours(24);
        String paymentStatusLabel = depositPaid
                ? (stage2Paid ? "Fully paid (Stage 1 & 2)" : "Deposit paid · Awaiting stage 2")
                : "Deposit unpaid (24h window)";

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

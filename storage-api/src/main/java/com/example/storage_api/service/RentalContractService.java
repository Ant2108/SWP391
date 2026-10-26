package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PriceRuleResponse;
import com.example.storage_api.model.reponse.RentalContractResponse;
import com.example.storage_api.model.request.RenewalRequest;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import lombok.RequiredArgsConstructor;
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
public class RentalContractService {
    private final RentalContractRepository contractRepository;
    private final ReservationRepository reservationRepository;
    private final PaymentRepository paymentRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final CurrentUserService currentUserService;
    private final PriceRuleService priceRuleService;

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
        return toResponse(contractRepository.save(contract));
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
     * Luồng Renewal:
     * Customer request renewal -> BE lấy giá RENEWAL từ PriceRules -> Create Payment -> Payment PAID -> Update RentalContract.EndDate.
     * Nếu request.paid == false: tạo Payment ở trạng thái PENDING (khi khách bấm Pay trên trang Payments, PaymentService.markPaid sẽ cộng thêm tháng vào EndDate).
     * Nếu request.paid == true hoặc null: tạo Payment ở trạng thái PAID và cộng thêm tháng vào EndDate ngay lập tức.
     */
    @Transactional
    public RentalContractResponse renew(Integer id, RenewalRequest request) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (caller.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("Only the contract customer can request a renewal");
        }
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Only active or overdue contracts can be renewed");
        }

        BigDecimal renewalMonthly = resolveRenewalMonthlyRate(contract);
        BigDecimal totalRenewalAmount = renewalMonthly.multiply(BigDecimal.valueOf(request.getMonths()))
                .setScale(2, RoundingMode.HALF_UP);

        boolean payImmediately = !Boolean.FALSE.equals(request.getPaid());
        String method = request.getPaymentMethod() != null && !request.getPaymentMethod().isBlank()
                ? request.getPaymentMethod().trim()
                : (payImmediately ? "CARD" : null);
        String ref = request.getTransactionReference() != null && !request.getTransactionReference().isBlank()
                ? request.getTransactionReference().trim()
                : "RENEW_MONTHS:" + request.getMonths();

        Payment renewalPayment = new Payment();
        renewalPayment.setCustomer(contract.getCustomer());
        renewalPayment.setReservation(contract.getReservation());
        renewalPayment.setRentalContract(contract);
        renewalPayment.setPaymentType(PaymentType.RENEWAL);
        renewalPayment.setAmount(totalRenewalAmount);
        renewalPayment.setPaymentMethod(method);
        renewalPayment.setTransactionReference(ref);
        renewalPayment.setStatus(payImmediately ? PaymentStatus.PAID : PaymentStatus.PENDING);
        renewalPayment.setPaidAt(payImmediately ? LocalDateTime.now() : null);
        paymentRepository.save(renewalPayment);

        if (payImmediately) {
            LocalDate baseDate = contract.getEndDate().isBefore(LocalDate.now())
                    ? LocalDate.now().minusDays(1)
                    : contract.getEndDate();
            contract.setEndDate(baseDate.plusMonths(request.getMonths()));
            contract.setMonthlyPrice(renewalMonthly);
            contract.setStatus(ContractStatus.ACTIVE);
            contract = contractRepository.save(contract);
        }
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
    @Transactional
    public int markOverdue() {
        List<RentalContract> expired = contractRepository.findByStatusAndEndDateBefore(
                ContractStatus.ACTIVE, LocalDate.now());
        expired.forEach(this::applyOverdueAndCreateFee);
        return expired.size();
    }

    /**
     * Hàm hỗ trợ cho luồng Check-in của Member 4: kích hoạt hợp đồng từ PENDING -> ACTIVE, StorageUnit -> OCCUPIED.
     */
    @Transactional
    public RentalContractResponse activateContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Contract must be PENDING to activate (current: " + contract.getStatus() + ")");
        }
        contract.setStatus(ContractStatus.ACTIVE);
        StorageUnit unit = contract.getStorageUnit();
        unit.setStatus(UnitStatus.OCCUPIED);
        storageUnitRepository.save(unit);
        Reservation reservation = contract.getReservation();
        if (reservation != null && reservation.getStatus() == ReservationStatus.CONFIRMED) {
            reservation.setStatus(ReservationStatus.COMPLETED);
            reservationRepository.save(reservation);
        }
        return toResponse(contractRepository.save(contract));
    }

    /**
     * Hàm hỗ trợ cho luồng Return của Member 4: đóng hợp đồng sang COMPLETED.
     */
    @Transactional
    public RentalContractResponse completeContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Only ACTIVE or OVERDUE contracts can be completed");
        }
        contract.setStatus(ContractStatus.COMPLETED);
        return toResponse(contractRepository.save(contract));
    }

    private void applyOverdueAndCreateFee(RentalContract contract) {
        contract.setStatus(ContractStatus.OVERDUE);
        contractRepository.save(contract);

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
        PriceRuleResponse rule = findRuleGracefully(PriceType.OVERDUE, facilityId, unitTypeId);
        long daysOverdue = Math.max(1L, ChronoUnit.DAYS.between(contract.getEndDate(), LocalDate.now()));
        if (rule == null) {
            return contract.getMonthlyPrice().multiply(BigDecimal.valueOf(10))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
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
        PriceRuleResponse rule = findRuleGracefully(PriceType.RENEWAL, facilityId, unitTypeId);
        if (rule == null) {
            return contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP);
        }
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
        PriceRuleResponse rule = findRuleGracefully(PriceType.RENTAL, facilityId, unitTypeId);
        if (rule == null || rule.getAmount() == null) {
            return BigDecimal.valueOf(1000000).setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveDepositAmount(Reservation reservation, BigDecimal monthlyPrice) {
        PriceRuleResponse rule = findRuleGracefully(
                PriceType.DEPOSIT,
                reservation.getFacility().getId(),
                reservation.getUnitType().getId());
        if (rule == null) {
            return monthlyPrice.multiply(BigDecimal.valueOf(50))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
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

    private PriceRuleResponse findRuleGracefully(PriceType type, Long facilityId, Integer unitTypeId) {
        try {
            return priceRuleService.getCurrent(type, facilityId, unitTypeId);
        } catch (Exception ignored) {
            try {
                return priceRuleService.getCurrent(type, facilityId, null);
            } catch (Exception ignored2) {
                try {
                    return priceRuleService.getCurrent(type, null, null);
                } catch (Exception ignored3) {
                    return null;
                }
            }
        }
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
                .createdAt(contract.getCreatedAt())
                .updatedAt(contract.getUpdatedAt())
                .build();
    }
}

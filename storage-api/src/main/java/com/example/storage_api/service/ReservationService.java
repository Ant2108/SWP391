package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PriceRuleResponse;
import com.example.storage_api.model.reponse.ReservationResponse;
import com.example.storage_api.model.request.ReservationCreateRequest;
import com.example.storage_api.reponsitory.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ReservationService {
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final FacilityRepository facilityRepository;
    private final UnitTypeRepository unitTypeRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final CurrentUserService currentUserService;
    private final PriceRuleService priceRuleService;

    @Transactional
    public ReservationResponse create(ReservationCreateRequest request) {
        Users customer = currentUserService.get();
        Facility facility = facilityRepository.findById(request.getFacilityId())
                .orElseThrow(() -> new ResourceNotFoundException("Facility not found: " + request.getFacilityId()));
        if (facility.getStatus() == FacilityStatus.INACTIVE) {
            throw new BadRequestException("Facility is currently inactive");
        }
        UnitType type = unitTypeRepository.findById(request.getUnitTypeId())
                .orElseThrow(() -> new ResourceNotFoundException("Unit type not found: " + request.getUnitTypeId()));
        if (!type.getFacility().getId().equals(facility.getId()) || !type.isActive()) {
            throw new BadRequestException("Unit type is inactive or does not belong to the facility");
        }

        BigDecimal monthly = resolveMonthlyRentalPrice(facility.getId(), type.getId());
        BigDecimal estimate = monthly.multiply(BigDecimal.valueOf(request.getRentalMonths()))
                .setScale(2, RoundingMode.HALF_UP);

        Reservation r = new Reservation();
        r.setCustomer(customer);
        r.setFacility(facility);
        r.setUnitType(type);
        r.setStartDate(request.getStartDate());
        r.setRentalMonths(request.getRentalMonths());
        r.setEstimatedAmount(estimate);
        r.setStatus(ReservationStatus.PENDING);
        return toResponse(reservationRepository.save(r));
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
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        currentUserService.assertFacilityAccess(currentUserService.get(), r.getFacility().getId());
        if (r.getStatus() == ReservationStatus.CANCELLED || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new ConflictException("Cancelled or completed reservation cannot be assigned");
        }
        StorageUnit unit = storageUnitRepository.findById(unitId)
                .orElseThrow(() -> new ResourceNotFoundException("Storage unit not found: " + unitId));
        if (!unit.getFacility().getId().equals(r.getFacility().getId())
                || !unit.getUnitType().getId().equals(r.getUnitType().getId())) {
            throw new BadRequestException("Unit does not match reservation facility and type");
        }
        boolean sameUnit = r.getStorageUnit() != null && r.getStorageUnit().getId().equals(unit.getId());
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
        return toResponse(saved);
    }

    @Transactional
    public ReservationResponse confirm(Integer id) {
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + id));
        currentUserService.assertFacilityAccess(currentUserService.get(), r.getFacility().getId());
        if (r.getStatus() == ReservationStatus.CANCELLED || r.getStatus() == ReservationStatus.COMPLETED) {
            throw new ConflictException("Cancelled or completed reservation cannot be confirmed");
        }
        if (r.getStorageUnit() == null) {
            List<StorageUnit> available = storageUnitRepository.search(
                    r.getFacility().getId(), r.getUnitType().getId(), UnitStatus.AVAILABLE);
            if (available.isEmpty()) {
                throw new BadRequestException("Please assign an available storage unit before confirming");
            }
            StorageUnit unit = available.get(0);
            unit.setStatus(UnitStatus.RESERVED);
            storageUnitRepository.save(unit);
            r.setStorageUnit(unit);
        }
        r.setStatus(ReservationStatus.CONFIRMED);
        Reservation saved = reservationRepository.save(r);

        ensureDepositPaymentExists(saved);
        ensurePendingContractIfDepositPaid(saved);
        return toResponse(saved);
    }

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
            }
        }
        if (r.getStorageUnit() != null && r.getStorageUnit().getStatus() == UnitStatus.RESERVED) {
            r.getStorageUnit().setStatus(UnitStatus.AVAILABLE);
            storageUnitRepository.save(r.getStorageUnit());
        }
        r.setStatus(ReservationStatus.CANCELLED);
        return toResponse(reservationRepository.save(r));
    }

    private void ensureDepositPaymentExists(Reservation r) {
        Optional<Payment> existing = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                r.getId(), PaymentType.DEPOSIT);
        if (existing.isPresent()) {
            return;
        }
        BigDecimal monthly = resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal deposit = resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly);
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
                rentalContractRepository.save(c);
            }
            return;
        }
        BigDecimal monthly = resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal deposit = resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly);

        RentalContract contract = new RentalContract();
        contract.setReservation(r);
        contract.setCustomer(r.getCustomer());
        contract.setStorageUnit(r.getStorageUnit());
        contract.setStartDate(r.getStartDate());
        contract.setEndDate(r.getStartDate().plusMonths(r.getRentalMonths()).minusDays(1));
        contract.setMonthlyPrice(monthly);
        contract.setDepositAmount(deposit);
        contract.setStatus(ContractStatus.PENDING);
        rentalContractRepository.save(contract);
    }

    public BigDecimal resolveMonthlyRentalPrice(Long facilityId, Integer unitTypeId) {
        PriceRuleResponse rule = findRuleGracefully(PriceType.RENTAL, facilityId, unitTypeId);
        if (rule == null || rule.getAmount() == null) {
            return BigDecimal.valueOf(1000000).setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal resolveDepositAmount(Long facilityId, Integer unitTypeId, BigDecimal monthlyPrice) {
        PriceRuleResponse rule = findRuleGracefully(PriceType.DEPOSIT, facilityId, unitTypeId);
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

    private ReservationResponse toResponse(Reservation r) {
        BigDecimal monthly = r.getRentalMonths() != null && r.getRentalMonths() > 0 && r.getEstimatedAmount() != null
                ? r.getEstimatedAmount().divide(BigDecimal.valueOf(r.getRentalMonths()), 2, RoundingMode.HALF_UP)
                : resolveMonthlyRentalPrice(r.getFacility().getId(), r.getUnitType().getId());
        BigDecimal depositAmount = paymentRepository.findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT)
                .map(Payment::getAmount)
                .orElseGet(() -> resolveDepositAmount(r.getFacility().getId(), r.getUnitType().getId(), monthly));
        boolean depositPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        Integer pendingDepositId = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PENDING)
                .map(Payment::getId)
                .orElse(null);
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
                .rentalMonths(r.getRentalMonths())
                .estimatedAmount(r.getEstimatedAmount())
                .depositAmount(depositAmount)
                .depositPaid(depositPaid)
                .pendingDepositPaymentId(pendingDepositId)
                .rentalContractId(contractOpt.map(RentalContract::getId).orElse(null))
                .contractStatus(contractOpt.map(RentalContract::getStatus).orElse(null))
                .status(r.getStatus())
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}

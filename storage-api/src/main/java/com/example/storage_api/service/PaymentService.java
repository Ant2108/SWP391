package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PaymentResponse;
import com.example.storage_api.model.reponse.PriceRuleResponse;
import com.example.storage_api.model.request.PaymentCreateRequest;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
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
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final CurrentUserService currentUserService;
    private final PriceRuleService priceRuleService;

    @Transactional(readOnly = true)
    public List<PaymentResponse> list(Long facilityId, PaymentStatus status, PaymentType paymentType) {
        Users caller = currentUserService.get();
        Long scopedFacility = facilityId;
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.FACILITY_MANAGER) {
            Long assigned = currentUserService.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(assigned)) {
                throw new BadRequestException("Facility access denied");
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
                    return true;
                })
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(Integer id) {
        Users user = currentUserService.get();
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found: " + id));
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

    @Transactional
    public PaymentResponse create(PaymentCreateRequest request) {
        Users caller = currentUserService.get();
        if (request.getTransactionReference() != null && request.getTransactionReference().length() > 150) {
            throw new BadRequestException("Transaction reference must not exceed 150 characters");
        }

        // Nếu truyền paymentId cụ thể để thanh toán một khoản đang PENDING
        if (request.getPaymentId() != null) {
            return markPaid(request.getPaymentId(), request.getPaymentMethod(), request.getTransactionReference());
        }

        Reservation reservation = null;
        RentalContract contract = null;
        if (request.getReservationId() != null) {
            reservation = reservationRepository.findById(request.getReservationId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Reservation not found: " + request.getReservationId()));
            if (caller.getRole() == Role.CUSTOMER) {
                assertCustomerOwns(caller, reservation.getCustomer());
            } else {
                currentUserService.assertFacilityAccess(caller, reservation.getFacility().getId());
            }
        }
        if (request.getRentalContractId() != null) {
            contract = rentalContractRepository.findById(request.getRentalContractId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Rental contract not found: " + request.getRentalContractId()));
            if (caller.getRole() == Role.CUSTOMER) {
                assertCustomerOwns(caller, contract.getCustomer());
            } else {
                currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
            }
        }
        if (reservation == null && contract == null) {
            throw new BadRequestException("A reservation or rental contract is required");
        }
        if (reservation != null && contract != null
                && !contract.getReservation().getId().equals(reservation.getId())) {
            throw new BadRequestException("Reservation and contract do not match");
        }

        PaymentType type = request.getPaymentType();
        if (type == PaymentType.DEPOSIT || type == PaymentType.RENTAL) {
            if (reservation == null && contract != null) {
                reservation = contract.getReservation();
            }
            if (reservation == null) {
                throw new BadRequestException(type + " payments must reference a reservation");
            }
            if (type == PaymentType.DEPOSIT
                    && paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                            reservation.getId(), type, PaymentStatus.PAID)) {
                throw new ConflictException("Deposit has already been paid for this reservation");
            }
            // Nếu đã có khoản DEPOSIT đang PENDING cho reservation này thì cập nhật luôn bản ghi đó
            if (type == PaymentType.DEPOSIT) {
                Optional<Payment> pendingDeposit = paymentRepository
                        .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                                reservation.getId(), PaymentType.DEPOSIT, PaymentStatus.PENDING);
                if (pendingDeposit.isPresent()) {
                    Payment p = pendingDeposit.get();
                    if (request.getAmount() != null) {
                        p.setAmount(request.getAmount().setScale(2, RoundingMode.HALF_UP));
                    }
                    p.setPaymentMethod(blankToNull(request.getPaymentMethod()));
                    p.setTransactionReference(blankToNull(request.getTransactionReference()));
                    boolean paid = Boolean.TRUE.equals(request.getPaid());
                    p.setStatus(paid ? PaymentStatus.PAID : PaymentStatus.PENDING);
                    p.setPaidAt(paid ? LocalDateTime.now() : null);
                    Payment saved = paymentRepository.save(p);
                    if (paid) {
                        applyPaidSideEffects(saved, request.getRenewalMonths());
                    }
                    return toResponse(saved);
                }
            }
        } else if (contract == null) {
            if (reservation != null) {
                contract = rentalContractRepository.findByReservation_Id(reservation.getId()).orElse(null);
            }
            if (contract == null) {
                throw new BadRequestException(type + " payments must reference a rental contract");
            }
        }

        // Nếu khách thanh toán cho một khoản phí (OVERDUE_FEE, DAMAGE_FEE, EXTRA_FEE, RENEWAL) đã tạo sẵn ở trạng thái PENDING
        if (contract != null && Boolean.TRUE.equals(request.getPaid())) {
            Optional<Payment> existingPending = paymentRepository
                    .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                            contract.getId(), type, PaymentStatus.PENDING);
            if (existingPending.isPresent()) {
                Payment p = existingPending.get();
                p.setPaymentMethod(blankToNull(request.getPaymentMethod()));
                if (request.getTransactionReference() != null && !request.getTransactionReference().isBlank()) {
                    p.setTransactionReference(request.getTransactionReference().trim());
                }
                p.setStatus(PaymentStatus.PAID);
                p.setPaidAt(LocalDateTime.now());
                Payment saved = paymentRepository.save(p);
                applyPaidSideEffects(saved, request.getRenewalMonths());
                return toResponse(saved);
            }
        }

        BigDecimal expected = resolveExpectedAmount(type, reservation, contract, request.getAmount(), request.getRenewalMonths());
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
        boolean paid = Boolean.TRUE.equals(request.getPaid());
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
                .orElseThrow(() -> new ResourceNotFoundException("Rental contract not found: " + contractId));
        authorizeFacilityOrOwner(user, contract);
        return paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contractId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public PaymentResponse markPaid(Integer id, String paymentMethod, String transactionReference) {
        Users user = currentUserService.get();
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found: " + id));
        if (user.getRole() == Role.CUSTOMER) {
            assertCustomerOwns(user, payment.getCustomer());
        } else {
            RentalContract contract = payment.getRentalContract();
            if (contract != null) {
                currentUserService.assertFacilityAccess(user, contract.getStorageUnit().getFacility().getId());
            } else if (payment.getReservation() != null) {
                currentUserService.assertFacilityAccess(user, payment.getReservation().getFacility().getId());
            } else {
                throw new BadRequestException("Payment has no facility context");
            }
        }
        if (payment.getStatus() == PaymentStatus.PAID) {
            throw new ConflictException("Payment has already been paid");
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new ConflictException("A refunded payment cannot be marked paid");
        }
        payment.setStatus(PaymentStatus.PAID);
        payment.setPaidAt(LocalDateTime.now());
        if (paymentMethod != null && !paymentMethod.isBlank()) {
            payment.setPaymentMethod(paymentMethod.trim());
        } else if (payment.getPaymentMethod() == null) {
            payment.setPaymentMethod("CARD");
        }
        if (transactionReference != null && !transactionReference.isBlank()) {
            payment.setTransactionReference(transactionReference.trim());
        }
        Payment saved = paymentRepository.save(payment);
        applyPaidSideEffects(saved, null);
        return toResponse(saved);
    }

    /**
     * Xử lý tự động sau khi thanh toán thành công (PAID):
     * 1. DEPOSIT PAID + Reservation CONFIRMED (đã gán kho) -> Tự động tạo RentalContract (PENDING) nếu chưa có.
     * 2. RENEWAL PAID -> Tự động cộng thêm tháng gia hạn vào RentalContract.EndDate và chuyển trạng thái về ACTIVE.
     */
    private void applyPaidSideEffects(Payment payment, Integer requestedMonths) {
        if (payment.getPaymentType() == PaymentType.DEPOSIT && payment.getReservation() != null) {
            Reservation r = payment.getReservation();
            if (r.getStorageUnit() != null
                    && (r.getStatus() == ReservationStatus.CONFIRMED || r.getStatus() == ReservationStatus.ASSIGNED)) {
                if (r.getStatus() == ReservationStatus.ASSIGNED) {
                    r.setStatus(ReservationStatus.CONFIRMED);
                    reservationRepository.save(r);
                }
                Optional<RentalContract> existing = rentalContractRepository.findByReservation_Id(r.getId());
                if (existing.isEmpty()) {
                    BigDecimal monthly = resolveMonthlyRental(r.getFacility().getId(), r.getUnitType().getId());
                    RentalContract contract = new RentalContract();
                    contract.setReservation(r);
                    contract.setCustomer(r.getCustomer());
                    contract.setStorageUnit(r.getStorageUnit());
                    contract.setStartDate(r.getStartDate());
                    contract.setEndDate(r.getStartDate().plusMonths(r.getRentalMonths()).minusDays(1));
                    contract.setMonthlyPrice(monthly);
                    contract.setDepositAmount(payment.getAmount());
                    contract.setStatus(ContractStatus.PENDING);
                    RentalContract savedContract = rentalContractRepository.save(contract);
                    payment.setRentalContract(savedContract);
                    paymentRepository.save(payment);
                }
            }
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
                                             RentalContract contract, BigDecimal requestedAmount,
                                             Integer renewalMonths) {
        if (type == PaymentType.DEPOSIT) {
            BigDecimal monthly = contract != null && contract.getMonthlyPrice() != null
                    ? contract.getMonthlyPrice()
                    : resolveMonthlyRental(reservation.getFacility().getId(), reservation.getUnitType().getId());
            PriceRuleResponse rule = findRuleGracefully(PriceType.DEPOSIT,
                    reservation.getFacility().getId(), reservation.getUnitType().getId());
            if (rule == null) {
                return requestedAmount != null
                        ? requestedAmount.setScale(2, RoundingMode.HALF_UP)
                        : monthly.multiply(BigDecimal.valueOf(50)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            return calculate(rule, monthly);
        }
        if (type == PaymentType.RENTAL) {
            BigDecimal monthly = resolveMonthlyRental(
                    reservation.getFacility().getId(), reservation.getUnitType().getId());
            return monthly.multiply(BigDecimal.valueOf(reservation.getRentalMonths()))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        if (type == PaymentType.RENEWAL) {
            int months = renewalMonths != null && renewalMonths > 0 ? renewalMonths : 1;
            PriceRuleResponse rule = findRuleGracefully(PriceType.RENEWAL, facilityId, unitTypeId);
            BigDecimal monthlyRate = rule != null ? calculate(rule, contract.getMonthlyPrice()) : contract.getMonthlyPrice();
            return monthlyRate.multiply(BigDecimal.valueOf(months)).setScale(2, RoundingMode.HALF_UP);
        }
        if (type == PaymentType.OVERDUE_FEE) {
            PriceRuleResponse rule = findRuleGracefully(PriceType.OVERDUE, facilityId, unitTypeId);
            if (rule == null) {
                return requestedAmount != null
                        ? requestedAmount.setScale(2, RoundingMode.HALF_UP)
                        : contract.getMonthlyPrice().multiply(BigDecimal.valueOf(10)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
                long days = Math.max(1L, ChronoUnit.DAYS.between(contract.getEndDate(), LocalDate.now()));
                return rule.getAmount().multiply(BigDecimal.valueOf(days)).setScale(2, RoundingMode.HALF_UP);
            }
            return calculate(rule, contract.getMonthlyPrice());
        }
        if (type == PaymentType.EXTRA_FEE || type == PaymentType.DAMAGE_FEE) {
            if (requestedAmount != null && requestedAmount.signum() > 0) {
                return requestedAmount.setScale(2, RoundingMode.HALF_UP);
            }
            PriceType pType = type == PaymentType.EXTRA_FEE ? PriceType.EXTRA_FEE : PriceType.DAMAGE_FEE;
            PriceRuleResponse rule = findRuleGracefully(pType, facilityId, unitTypeId);
            if (rule != null) {
                return calculate(rule, contract.getMonthlyPrice());
            }
            throw new BadRequestException("Amount is required for " + type);
        }
        throw new BadRequestException("Unsupported payment type: " + type);
    }

    private BigDecimal resolveMonthlyRental(Long facilityId, Integer unitTypeId) {
        PriceRuleResponse rule = findRuleGracefully(PriceType.RENTAL, facilityId, unitTypeId);
        if (rule == null || rule.getAmount() == null) {
            return BigDecimal.valueOf(1000000).setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
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

    private BigDecimal calculate(PriceRuleResponse rule, BigDecimal base) {
        if (rule.getCalculationType() == CalculationType.PERCENTAGE) {
            if (base == null || rule.getPercentage() == null) {
                throw new BadRequestException("Percentage price requires a base amount");
            }
            return base.multiply(rule.getPercentage()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        BigDecimal amount = rule.getAmount();
        if (amount == null) {
            throw new BadRequestException("Price rule is missing its amount");
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
            throw new BadRequestException("Requested payment does not belong to this customer");
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
                .build();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

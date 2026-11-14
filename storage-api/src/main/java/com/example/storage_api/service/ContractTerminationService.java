package com.example.storage_api.service;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.ContractTermination;
import com.example.storage_api.entity.DamageStatus;
import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.TerminationStatus;
import com.example.storage_api.entity.UnitReturn;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PolicyResponse;
import com.example.storage_api.model.reponse.TerminationQuoteResponse;
import com.example.storage_api.model.reponse.TerminationResponse;
import com.example.storage_api.model.request.TerminationRejectRequest;
import com.example.storage_api.model.request.TerminationRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.ContractTerminationRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Hủy hợp đồng sớm (sau khi khách đã nhận kho):
 * khách yêu cầu + đồng ý điều khoản -> quản lý liên hệ và cử nhân viên kiểm tra kho (lập biên bản trả kho như bình thường)
 * -> quản lý chốt phí hư hại (nếu có) và bấm xác nhận hủy -> hợp đồng kết thúc, tính tiền:
 * mất cọc (theo chính sách), tiền thuê tính TRỌN THÁNG đã dùng, hoàn các tháng chưa dùng, trừ phí hư hại / phát sinh.
 */
@Service
@RequiredArgsConstructor
public class ContractTerminationService {

    private static final List<TerminationStatus> OPEN = List.of(TerminationStatus.REQUESTED, TerminationStatus.INSPECTED);
    private static final String BILL_REF = "HUY_SOM";

    private final ContractTerminationRepository terminationRepository;
    private final RentalContractRepository contractRepository;
    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final UnitReturnRepository unitReturnRepository;
    private final PolicyService policyService;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    // ===================== TÍNH TIỀN =====================

    /** Kết quả tính tiền hủy sớm. */
    record Settlement(int monthsTotal, int usedMonths, BigDecimal monthlyRent, BigDecimal rentPaid, BigDecimal rentUsed,
                      BigDecimal deposit, BigDecimal depositForfeited, BigDecimal pendingFees, BigDecimal damageFee,
                      BigDecimal net) {
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    /** Mọi khoản thanh toán của hợp đồng (theo hợp đồng và theo đơn đặt kho), không trùng. */
    private List<Payment> paymentsOf(RentalContract c) {
        Map<Integer, Payment> m = new LinkedHashMap<>();
        for (Payment p : paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(c.getId())) {
            m.put(p.getId(), p);
        }
        if (c.getReservation() != null) {
            for (Payment p : paymentRepository.findByReservation_IdOrderByCreatedAtDesc(c.getReservation().getId())) {
                m.putIfAbsent(p.getId(), p);
            }
        }
        return new ArrayList<>(m.values());
    }

    private Optional<Payment> paidDeposit(List<Payment> all) {
        return all.stream().filter(p -> p.getPaymentType() == PaymentType.DEPOSIT && p.getStatus() == PaymentStatus.PAID).findFirst();
    }

    /** Số tháng của hợp đồng (gồm cả phần đã gia hạn). */
    static int monthsTotal(RentalContract c) {
        long m = ChronoUnit.MONTHS.between(c.getStartDate(), c.getEndDate().plusDays(1));
        return (int) Math.max(1, m);
    }

    /** Số tháng đã dùng tính TRỌN tháng: tháng nào đã bắt đầu thì tính đủ tháng đó. */
    static int usedMonths(RentalContract c, LocalDate effective, int total) {
        if (effective.isBefore(c.getStartDate())) {
            return 1;
        }
        long m = ChronoUnit.MONTHS.between(c.getStartDate(), effective) + 1;
        return (int) Math.min(Math.max(1, m), total);
    }

    Settlement compute(RentalContract c, LocalDate effective, int forfeitPercent, BigDecimal damageFee) {
        List<Payment> all = paymentsOf(c);
        int total = monthsTotal(c);
        BigDecimal rentPaid = BigDecimal.ZERO;
        BigDecimal rentAll = BigDecimal.ZERO;   // tiền thuê của cả thời hạn (đã đóng + Đợt 2 chưa đóng)
        BigDecimal fees = BigDecimal.ZERO;
        for (Payment p : all) {
            PaymentType t = p.getPaymentType();
            if (t == PaymentType.RENTAL || t == PaymentType.RENEWAL) {
                if (p.getStatus() == PaymentStatus.PAID) {
                    rentPaid = rentPaid.add(p.getAmount());
                    rentAll = rentAll.add(p.getAmount());
                } else if (p.getStatus() == PaymentStatus.PENDING && t == PaymentType.RENTAL) {
                    rentAll = rentAll.add(p.getAmount());
                }
            } else if ((t == PaymentType.OVERDUE_FEE || t == PaymentType.EXTRA_FEE) && p.getStatus() == PaymentStatus.PENDING
                    && !BILL_REF.equals(p.getTransactionReference())) {
                fees = fees.add(p.getAmount());
            }
        }
        BigDecimal monthly = rentAll.signum() > 0
                ? rentAll.divide(BigDecimal.valueOf(total), 0, RoundingMode.HALF_UP)
                : nz(c.getMonthlyPrice());
        int used = usedMonths(c, effective, total);
        BigDecimal rentUsed = monthly.multiply(BigDecimal.valueOf(used));
        if (rentAll.signum() > 0) {
            rentUsed = rentUsed.min(rentAll);
        }
        BigDecimal deposit = paidDeposit(all).map(d -> c.getDepositAmount() != null ? c.getDepositAmount() : d.getAmount())
                .orElse(BigDecimal.ZERO);
        BigDecimal forfeited = deposit.multiply(BigDecimal.valueOf(forfeitPercent)).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
        BigDecimal dmg = nz(damageFee);
        BigDecimal net = rentPaid.add(deposit).subtract(forfeited).subtract(rentUsed).subtract(fees).subtract(dmg);
        return new Settlement(total, used, monthly, rentPaid, rentUsed, deposit, forfeited, fees, dmg, net);
    }

    // ===================== KHÁCH =====================

    @Transactional(readOnly = true)
    public TerminationQuoteResponse quote(Integer contractId) {
        Users caller = currentUser.get();
        RentalContract c = ownContract(caller, contractId);
        PolicyResponse pol = policyService.get();
        String blocked = blockedReason(c);
        LocalDate effective = LocalDate.now().plusDays(pol.getEarlyTerminationNoticeDays());
        Settlement s = compute(c, effective, pol.getEarlyTerminationForfeitPercent(), BigDecimal.ZERO);
        return TerminationQuoteResponse.builder()
                .contractId(c.getId()).canRequest(blocked == null).blockedReason(blocked)
                .noticeDays(pol.getEarlyTerminationNoticeDays()).forfeitPercent(pol.getEarlyTerminationForfeitPercent())
                .monthsTotal(s.monthsTotal()).usedMonths(s.usedMonths()).effectiveDate(effective)
                .monthlyRent(s.monthlyRent()).rentPaid(s.rentPaid()).rentUsed(s.rentUsed())
                .deposit(s.deposit()).depositForfeited(s.depositForfeited()).pendingFees(s.pendingFees())
                .estimatedRefund(s.net().max(BigDecimal.ZERO)).estimatedExtra(s.net().negate().max(BigDecimal.ZERO))
                .build();
    }

    private String blockedReason(RentalContract c) {
        if (c.getStatus() != ContractStatus.ACTIVE) {
            return "Chỉ hợp đồng đang thuê mới yêu cầu hủy sớm được";
        }
        if (terminationRepository.findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(c.getId(), OPEN).isPresent()) {
            return "Hợp đồng này đã có yêu cầu hủy sớm đang được xử lý";
        }
        return null;
    }

    @Transactional
    public TerminationResponse request(Integer contractId, TerminationRequest req) {
        Users caller = currentUser.get();
        RentalContract c = ownContract(caller, contractId);
        String blocked = blockedReason(c);
        if (blocked != null) {
            throw new ConflictException(blocked);
        }
        if (!Boolean.TRUE.equals(req.getAgreed())) {
            throw new BadRequestException("Vui lòng tích đồng ý với điều khoản hủy hợp đồng sớm");
        }
        PolicyResponse pol = policyService.get();
        ContractTermination t = new ContractTermination();
        t.setRentalContract(c);
        t.setCustomer(caller);
        t.setStatus(TerminationStatus.REQUESTED);
        t.setRequestedAt(LocalDateTime.now());
        t.setAgreedAt(LocalDateTime.now());
        t.setReason(blankToNull(req.getReason()));
        t.setNoticeDays(pol.getEarlyTerminationNoticeDays());
        t.setForfeitPercent(pol.getEarlyTerminationForfeitPercent());
        ContractTermination saved = terminationRepository.save(t);

        StorageUnit unit = c.getStorageUnit();
        notifier.notifyFacilityManagers(unit.getFacility().getId(), "Early termination request",
                "Khách yêu cầu hủy hợp đồng sớm",
                "Khách " + caller.getFullname() + " yêu cầu hủy hợp đồng ô " + unit.getUnitCode()
                        + ". Vui lòng liên hệ khách, cử nhân viên kiểm tra kho rồi xác nhận hủy.", "/admin/terminations");
        notifier.notifyUser(caller, "Early termination request received", "Đã nhận yêu cầu hủy hợp đồng",
                "Yêu cầu hủy hợp đồng ô " + unit.getUnitCode() + " đã được gửi. Quản lý cơ sở sẽ liên hệ với bạn để hẹn kiểm tra kho. "
                        + "Hợp đồng vẫn có hiệu lực cho đến khi quản lý xác nhận hủy.", "/account/contracts");
        return toResponse(saved);
    }

    @Transactional
    public TerminationResponse withdraw(Integer id) {
        Users caller = currentUser.get();
        ContractTermination t = find(id);
        if (!t.getCustomer().getId().equals(caller.getId())) {
            throw new ResourceNotFoundException("Không tìm thấy yêu cầu hủy: " + id);
        }
        if (t.getStatus() != TerminationStatus.REQUESTED) {
            throw new ConflictException("Chỉ rút lại được khi nhân viên chưa kiểm tra kho xong");
        }
        t.setStatus(TerminationStatus.WITHDRAWN);
        t.setDecidedAt(LocalDateTime.now());
        ContractTermination saved = terminationRepository.save(t);
        cancelScheduledReturns(t.getRentalContract().getId());
        StorageUnit unit = t.getRentalContract().getStorageUnit();
        notifier.notifyFacilityManagers(unit.getFacility().getId(), "Early termination withdrawn",
                "Khách đã rút yêu cầu hủy hợp đồng",
                "Khách " + caller.getFullname() + " đã rút lại yêu cầu hủy hợp đồng ô " + unit.getUnitCode() + ".", "/admin/terminations");
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<TerminationResponse> my() {
        Users caller = currentUser.get();
        return terminationRepository.findByCustomer_IdOrderByRequestedAtDesc(caller.getId()).stream().map(this::toResponse).toList();
    }

    // ===================== QUẢN LÝ / NHÂN VIÊN =====================

    @Transactional(readOnly = true)
    public List<TerminationResponse> list(TerminationStatus status) {
        Users caller = currentUser.get();
        List<ContractTermination> rows;
        if (caller.getRole() == Role.SYSTEM_ADMIN) {
            rows = terminationRepository.findAllByOrderByRequestedAtDesc();
        } else {
            Long fid = currentUser.requireFacilityId(caller);
            rows = terminationRepository.findByRentalContract_StorageUnit_Facility_IdOrderByRequestedAtDesc(fid);
        }
        return rows.stream().filter(t -> status == null || t.getStatus() == status).map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public TerminationResponse get(Integer id) {
        Users caller = currentUser.get();
        ContractTermination t = find(id);
        if (caller.getRole() == Role.CUSTOMER) {
            if (!t.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Không tìm thấy yêu cầu hủy: " + id);
            }
        } else if (caller.getRole() != Role.SYSTEM_ADMIN) {
            currentUser.assertFacilityAccess(caller, t.getRentalContract().getStorageUnit().getFacility().getId());
        }
        return toResponse(t);
    }

    @Transactional
    public TerminationResponse reject(Integer id, TerminationRejectRequest req) {
        Users manager = currentUser.get();
        ContractTermination t = find(id);
        Long facilityId = t.getRentalContract().getStorageUnit().getFacility().getId();
        currentUser.assertManagerOfFacility(manager, facilityId);
        if (!OPEN.contains(t.getStatus())) {
            throw new ConflictException("Yêu cầu này đã được xử lý xong");
        }
        // Đã kiểm tra kho nhưng không hủy nữa: bỏ biên bản trả kho tạm để hợp đồng còn trả kho bình thường sau này.
        UnitReturn ur = t.getUnitReturn();
        if (ur != null) {
            t.setUnitReturn(null);
            terminationRepository.save(t);
            unitReturnRepository.delete(ur);
        }
        t.setStatus(TerminationStatus.REJECTED);
        t.setRejectReason(req.getReason().trim());
        t.setDecidedBy(manager);
        t.setDecidedAt(LocalDateTime.now());
        ContractTermination saved = terminationRepository.save(t);
        cancelScheduledReturns(t.getRentalContract().getId());
        notifier.notifyUser(t.getCustomer(), "Early termination declined", "Yêu cầu hủy hợp đồng chưa được chấp nhận",
                "Lý do: " + saved.getRejectReason() + "\nHợp đồng ô " + t.getRentalContract().getStorageUnit().getUnitCode()
                        + " vẫn tiếp tục có hiệu lực.", "/account/contracts");
        return toResponse(saved);
    }

    /** Quản lý xác nhận hủy sau khi nhân viên đã kiểm tra kho (và đã chốt phí hư hại nếu có). */
    @Transactional
    public TerminationResponse confirm(Integer id) {
        Users manager = currentUser.get();
        ContractTermination t = find(id);
        RentalContract c = t.getRentalContract();
        StorageUnit unit = c.getStorageUnit();
        currentUser.assertManagerOfFacility(manager, unit.getFacility().getId());
        if (t.getStatus() != TerminationStatus.INSPECTED || t.getUnitReturn() == null) {
            throw new ConflictException("Cần nhân viên kiểm tra kho xong trước khi xác nhận hủy");
        }
        UnitReturn ur = t.getUnitReturn();
        if (ur.isHasDamage() && ur.getDamageStatus() != DamageStatus.FEE_ISSUED) {
            throw new ConflictException("Kho có hư hại: vui lòng chốt phí hư hại (mục Hư hại) trước khi xác nhận hủy");
        }
        BigDecimal damageFee = ur.isHasDamage() ? nz(ur.getDamageFee()) : BigDecimal.ZERO;
        Settlement s = compute(c, effectiveDate(t), t.getForfeitPercent(), damageFee);
        List<Payment> all = paymentsOf(c);

        // Khoản tiền thuê / gia hạn chưa đóng không còn hiệu lực; phí chưa đóng được tính gộp vào số hoàn / phải trả.
        for (Payment p : all) {
            PaymentType pt = p.getPaymentType();
            if (p.getStatus() == PaymentStatus.PENDING && (pt == PaymentType.RENTAL || pt == PaymentType.RENEWAL)) {
                p.setStatus(PaymentStatus.FAILED);
                paymentRepository.save(p);
            } else if (p.getStatus() == PaymentStatus.PENDING && (pt == PaymentType.OVERDUE_FEE || pt == PaymentType.EXTRA_FEE)
                    && !BILL_REF.equals(p.getTransactionReference())) {
                p.setStatus(PaymentStatus.PAID);
                p.setPaidAt(LocalDateTime.now());
                p.setPaymentMethod("TRU_KHI_HUY_SOM");
                paymentRepository.save(p);
            }
        }

        BigDecimal refund = s.net().max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        BigDecimal extra = s.net().negate().max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        Optional<Payment> depOpt = paidDeposit(all);
        if (depOpt.isPresent()) {
            Payment dep = depOpt.get();
            List<String> lines = new ArrayList<>();
            if (s.rentPaid().signum() > 0) {
                lines.add("+Tiền thuê đã đóng trước|" + s.rentPaid().toPlainString());
            }
            if (s.depositForfeited().signum() > 0) {
                lines.add("Mất cọc do hủy hợp đồng sớm (" + t.getForfeitPercent() + "%)|" + s.depositForfeited().toPlainString());
            }
            lines.add("Tiền thuê " + s.usedMonths() + "/" + s.monthsTotal() + " tháng đã sử dụng (tính trọn tháng)|" + s.rentUsed().toPlainString());
            if (s.damageFee().signum() > 0) {
                lines.add("Phí hư hại|" + s.damageFee().toPlainString());
            }
            if (s.pendingFees().signum() > 0) {
                lines.add("Phí phát sinh chưa thanh toán|" + s.pendingFees().toPlainString());
            }
            BigDecimal deduction = s.depositForfeited().add(s.damageFee()).add(s.pendingFees());
            dep.setStatus(PaymentStatus.REFUNDED);
            dep.setRefundAmount(refund);
            dep.setDeductionAmount(deduction.setScale(2, RoundingMode.HALF_UP));
            dep.setDeductionLines(String.join(";", lines));
            dep.setTransactionReference(t.getForfeitPercent() >= 100 ? "MAT_COC_HUY_SOM:" + refund : "HUY_SOM_HOAN:" + refund);
            paymentRepository.save(dep);
            t.setRefundPaymentId(dep.getId());
        }
        if (extra.signum() > 0) {
            Payment bill = new Payment();
            bill.setCustomer(c.getCustomer());
            bill.setReservation(c.getReservation());
            bill.setRentalContract(c);
            bill.setPaymentType(PaymentType.EXTRA_FEE);
            bill.setAmount(extra);
            bill.setStatus(PaymentStatus.PENDING);
            bill.setTransactionReference(BILL_REF);
            paymentRepository.save(bill);
        }

        c.setStatus(ContractStatus.COMPLETED);
        contractRepository.save(c);
        unit.setStatus(ur.isHasDamage() ? UnitStatus.MAINTENANCE : UnitStatus.AVAILABLE);
        storageUnitRepository.save(unit);
        cancelScheduledReturns(c.getId());

        t.setStatus(TerminationStatus.COMPLETED);
        t.setDecidedBy(manager);
        t.setDecidedAt(LocalDateTime.now());
        t.setCompletedAt(LocalDateTime.now());
        t.setUsedMonths(s.usedMonths());
        t.setRentUsedAmount(s.rentUsed());
        t.setDepositForfeited(s.depositForfeited());
        t.setDamageFeeApplied(s.damageFee());
        t.setRefundAmount(refund);
        t.setExtraBilled(extra);
        ContractTermination saved = terminationRepository.save(t);

        String money;
        if (refund.signum() > 0) {
            money = "Số tiền hoàn lại cho bạn: " + String.format("%,.0f", refund)
                    + " VND (công ty sẽ chuyển khoản về tài khoản bạn đã dùng để đóng cọc).";
        } else if (extra.signum() > 0) {
            money = "Bạn còn phải thanh toán thêm " + String.format("%,.0f", extra) + " VND, vui lòng xem mục Thanh toán.";
        } else {
            money = "Không có khoản nào cần hoàn hoặc thanh toán thêm.";
        }
        notifier.notifyUser(c.getCustomer(), "Contract terminated", "Hợp đồng đã được hủy",
                "Hợp đồng ô " + unit.getUnitCode() + " đã kết thúc theo yêu cầu hủy sớm của bạn.\n" + money, "/account/payments");
        return toResponse(saved);
    }

    /** Ngày tính tiền thuê: ngày trả kho thực tế, nhưng không sớm hơn hết thời gian báo trước. */
    private LocalDate effectiveDate(ContractTermination t) {
        LocalDate noticeEnd = t.getRequestedAt().toLocalDate().plusDays(t.getNoticeDays());
        LocalDate inspected = t.getInspectedAt() != null ? t.getInspectedAt().toLocalDate() : LocalDate.now();
        return inspected.isAfter(noticeEnd) ? inspected : noticeEnd;
    }

    private void cancelScheduledReturns(Integer contractId) {
        for (Appointment a : appointmentRepository.findByRentalContract_IdAndAppointmentTypeAndStatus(
                contractId, AppointmentType.RETURN, AppointmentStatus.SCHEDULED)) {
            a.setStatus(AppointmentStatus.CANCELLED);
            appointmentRepository.save(a);
        }
    }

    // ===================== DÙNG BỞI UnitReturnService =====================

    /** Yêu cầu hủy đang chờ kiểm tra kho (REQUESTED) của hợp đồng, nếu có. */
    @Transactional(readOnly = true)
    public Optional<ContractTermination> awaitingInspection(Integer contractId) {
        return terminationRepository.findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(
                contractId, List.of(TerminationStatus.REQUESTED));
    }

    /** Yêu cầu hủy đã kiểm tra kho, đang chờ quản lý xác nhận (INSPECTED), nếu có. */
    @Transactional(readOnly = true)
    public Optional<ContractTermination> awaitingConfirmation(Integer contractId) {
        return terminationRepository.findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(
                contractId, List.of(TerminationStatus.INSPECTED));
    }

    // ===================== HELPERS =====================

    private ContractTermination find(Integer id) {
        return terminationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu hủy: " + id));
    }

    private RentalContract ownContract(Users caller, Integer contractId) {
        RentalContract c = contractRepository.findById(contractId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + contractId));
        if (caller.getRole() != Role.CUSTOMER || !c.getCustomer().getId().equals(caller.getId())) {
            throw new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + contractId);
        }
        return c;
    }

    TerminationResponse toResponse(ContractTermination t) {
        RentalContract c = t.getRentalContract();
        StorageUnit unit = c.getStorageUnit();
        UnitReturn ur = t.getUnitReturn();
        boolean open = OPEN.contains(t.getStatus());
        TerminationResponse.TerminationResponseBuilder b = TerminationResponse.builder()
                .id(t.getId()).contractId(c.getId())
                .customerId(t.getCustomer().getId()).customerName(t.getCustomer().getFullname()).customerPhone(t.getCustomer().getPhone())
                .facilityId(unit.getFacility().getId()).facilityName(unit.getFacility().getName())
                .unitCode(unit.getUnitCode()).unitTypeName(unit.getUnitType() != null ? unit.getUnitType().getTypeName() : null)
                .contractStart(c.getStartDate()).contractEnd(c.getEndDate())
                .status(t.getStatus()).requestedAt(t.getRequestedAt()).reason(t.getReason())
                .noticeDays(t.getNoticeDays()).forfeitPercent(t.getForfeitPercent())
                .noticeEndDate(t.getRequestedAt().toLocalDate().plusDays(t.getNoticeDays()))
                .rejectReason(t.getRejectReason()).decidedAt(t.getDecidedAt())
                .unitReturnId(ur != null ? ur.getId() : null).inspectedAt(t.getInspectedAt())
                .hasDamage(ur != null && ur.isHasDamage())
                .damageStatus(ur != null && ur.getDamageStatus() != null ? ur.getDamageStatus().name() : null)
                .damageFee(ur != null ? ur.getDamageFee() : null)
                .completedAt(t.getCompletedAt());
        if (open) {
            List<Appointment> appts = appointmentRepository.findByRentalContract_IdAndAppointmentTypeAndStatus(
                    c.getId(), AppointmentType.RETURN, AppointmentStatus.SCHEDULED);
            if (!appts.isEmpty()) {
                Appointment a = appts.get(0);
                b.inspectionAppointmentId(a.getId()).inspectionAt(a.getScheduledAt())
                        .inspectionStaffName(a.getStaff() != null ? a.getStaff().getFullname() : null);
            }
            BigDecimal fee = ur != null && ur.getDamageStatus() == DamageStatus.FEE_ISSUED ? nz(ur.getDamageFee()) : BigDecimal.ZERO;
            Settlement s = compute(c, effectiveDate(t), t.getForfeitPercent(), fee);
            b.monthsTotal(s.monthsTotal()).usedMonths(s.usedMonths()).rentPaid(s.rentPaid()).rentUsed(s.rentUsed())
                    .deposit(s.deposit()).depositForfeited(s.depositForfeited()).pendingFees(s.pendingFees())
                    .refundAmount(s.net().max(BigDecimal.ZERO)).extraBilled(s.net().negate().max(BigDecimal.ZERO));
        } else if (t.getStatus() == TerminationStatus.COMPLETED) {
            b.monthsTotal(monthsTotal(c)).usedMonths(t.getUsedMonths()).rentUsed(t.getRentUsedAmount())
                    .depositForfeited(t.getDepositForfeited()).refundAmount(t.getRefundAmount()).extraBilled(t.getExtraBilled());
            if (t.getRefundPaymentId() != null) {
                b.refundPaymentId(t.getRefundPaymentId());
                paymentRepository.findById(t.getRefundPaymentId())
                        .ifPresent(p -> b.refundTransferred(p.getRefundedAt() != null));
            }
        }
        return b.build();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

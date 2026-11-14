package com.example.storage_api.service;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.ContractTermination;
import com.example.storage_api.entity.TerminationStatus;
import com.example.storage_api.entity.DamageStatus;
import com.example.storage_api.entity.DamageType;
import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitReturn;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.UnitReturnResponse;
import com.example.storage_api.model.request.UnitReturnRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.ContractTerminationRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Nghiệp vụ trả kho. Khách đến trả -> staff kiểm tra unit -> tạo UnitReturn:
 *  - Không hư hại: StorageUnit -> AVAILABLE, RentalContract -> COMPLETED, hoàn đủ cọc ngay.
 *  - Có hư hại: staff chỉ TÍCH các loại hư hại (và mô tả nếu "Other"), chưa có phí. StorageUnit -> MAINTENANCE,
 *    RentalContract -> COMPLETED, manager của cơ sở được báo để cử người sửa. Sau khi sửa xong, manager hoặc staff
 *    của cơ sở chốt phí hư hại (issueDamageFee): phí trừ vào tiền cọc hoàn lại trước, phần vượt quá tiền cọc mới
 *    lập hóa đơn DAMAGE_FEE (PENDING) cho khách; việc hoàn cọc diễn ra lúc này.
 * Phí quá hạn (overdue) do module hợp đồng/thanh toán xử lý. Lịch RETURN liên quan (nếu có) được đóng COMPLETED.
 */
@Service
@RequiredArgsConstructor
public class UnitReturnService {

    private final UnitReturnRepository unitReturnRepository;
    private final RentalContractRepository rentalContractRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final RentalContractService rentalContractService;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;
    private final ContractTerminationRepository terminationRepository;

    @Transactional
    public UnitReturnResponse create(UnitReturnRequest req) {
        Users staff = currentUser.get();
        RentalContract contract = rentalContractRepository.findById(req.getRentalContractId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + req.getRentalContractId()));
        StorageUnit unit = contract.getStorageUnit();
        currentUser.assertFacilityAccess(staff, unit.getFacility().getId());

        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new BadRequestException("Chỉ hợp đồng đang thuê hoặc quá hạn mới trả kho được (hiện tại: "
                    + contract.getStatus() + ")");
        }
        if (unitReturnRepository.existsByRentalContract_Id(contract.getId())) {
            throw new ConflictException("Hợp đồng này đã được trả kho");
        }

        boolean damaged = Boolean.TRUE.equals(req.getHasDamage());
        String damageDescription = blankToNull(req.getDamageDescription());
        String damageItems = null;
        if (damaged) {
            List<DamageType> items = req.getDamageItems() == null ? List.of() : req.getDamageItems().stream().distinct().toList();
            if (items.isEmpty() && damageDescription == null) {
                throw new BadRequestException("Vui lòng tích ít nhất một loại hư hại, hoặc mô tả ở mục Khác");
            }
            if (items.contains(DamageType.OTHER) && damageDescription == null) {
                throw new BadRequestException("Vui lòng mô tả hư hại khi chọn mục Khác");
            }
            damageItems = items.isEmpty() ? null : items.stream().map(Enum::name).collect(Collectors.joining(","));
        }

        Appointment appointment = resolveReturnAppointment(req, contract, staff);

        UnitReturn ur = new UnitReturn();
        ur.setRentalContract(contract);
        ur.setCustomer(contract.getCustomer());
        ur.setStaff(staff);
        ur.setReturnedAt(LocalDateTime.now());
        ur.setUnitCondition(blankToNull(req.getUnitCondition()));
        ur.setHasDamage(damaged);
        ur.setDamageItems(damageItems);
        ur.setDamageDescription(damaged ? damageDescription : null);
        ur.setDamageStatus(damaged ? DamageStatus.REPORTED : null);
        ur.setNotes(blankToNull(req.getNotes()));
        UnitReturn saved = unitReturnRepository.save(ur);

        if (appointment != null) {
            appointment.setStatus(AppointmentStatus.COMPLETED);
            appointmentRepository.save(appointment);
        }

        // Khách đang yêu cầu hủy sớm: đây là buổi kiểm tra kho. Hợp đồng và ô kho giữ nguyên, tiền chưa tính;
        // quản lý sẽ chốt phí hư hại (nếu có) rồi xác nhận hủy.
        Optional<ContractTermination> termination = terminationRepository
                .findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(contract.getId(), List.of(TerminationStatus.REQUESTED));
        if (termination.isPresent()) {
            ContractTermination t = termination.get();
            t.setStatus(TerminationStatus.INSPECTED);
            t.setUnitReturn(saved);
            t.setInspectedAt(ur.getReturnedAt());
            terminationRepository.save(t);
            notifier.notifyFacilityManagers(unit.getFacility().getId(), "Unit inspected for early termination",
                    "Đã kiểm tra kho xong, chờ xác nhận hủy",
                    "Nhân viên đã kiểm tra ô " + unit.getUnitCode() + (damaged ? " và ghi nhận hư hại (" + describeDamage(saved) + "). Vui lòng chốt phí hư hại rồi xác nhận hủy."
                            : ", kho không có hư hại. Bạn có thể xác nhận hủy hợp đồng.") , "/admin/terminations");
            return toResponse(saved, unit, null);
        }

        contract.setStatus(ContractStatus.COMPLETED);
        unit.setStatus(damaged ? UnitStatus.MAINTENANCE : UnitStatus.AVAILABLE);
        rentalContractRepository.save(contract);
        storageUnitRepository.save(unit);

        if (damaged) {
            // Chưa hoàn cọc và chưa có phí: chờ sửa xong rồi manager / staff cơ sở chốt phí.
            String what = describeDamage(saved);
            notifier.notifyFacilityManagers(unit.getFacility().getId(), "Damage found on a returned unit",
                    "Damage found on a returned unit",
                    "Unit " + unit.getUnitCode() + " was returned with damage: " + what
                            + "\nPlease arrange the repair, then set the damage fee.", "/admin/appointments");
            notifier.notifyUser(contract.getCustomer(), "Unit returned with damage", "Your unit was returned",
                    "Unit " + unit.getUnitCode() + " was returned and some damage was found: " + what
                            + "\nThe damage fee will be confirmed after the repair. It is deducted from your deposit "
                            + "first, and your deposit refund is processed once it is confirmed.", "/account/payments");
        } else {
            // Không hư hại: hoàn trả tiền đặt cọc ngay.
            rentalContractService.refundDepositOnReturn(contract, null);
            notifier.notifyUser(contract.getCustomer(), "Unit returned", "Your unit was returned",
                    "Unit " + unit.getUnitCode() + " was returned and inspected with no damage. "
                            + "Your rental contract is now completed. Thank you!", "/account/units");
        }
        return toResponse(saved, unit, null);
    }

    /**
     * Chốt phí hư hại sau khi sửa xong (manager hoặc staff của cơ sở đó). Phí trừ vào tiền cọc hoàn lại trước,
     * chỉ phần vượt quá tiền cọc mới lập hóa đơn DAMAGE_FEE (PENDING). Phí 0 = không thu, hoàn đủ cọc.
     */
    @Transactional
    public UnitReturnResponse issueDamageFee(Integer id, java.util.Map<String, BigDecimal> itemFees, BigDecimal totalFee) {
        Users caller = currentUser.get();
        UnitReturn ur = unitReturnRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy biên bản trả kho: " + id));
        RentalContract contract = ur.getRentalContract();
        StorageUnit unit = contract.getStorageUnit();
        currentUser.assertFacilityAccess(caller, unit.getFacility().getId());
        if (!currentUser.isStaffOrManager(caller)) {
            throw new AccessDeniedException("Chỉ nhân viên hoặc quản lý của cơ sở mới chốt được phí hư hại");
        }
        if (!ur.isHasDamage() || ur.getDamageStatus() != DamageStatus.REPORTED) {
            throw new ConflictException("Biên bản trả kho này không có hư hại đang chờ chốt phí");
        }
        BigDecimal damageFee;
        String breakdown = null;
        if (itemFees != null && !itemFees.isEmpty()) {
            // Mỗi hạng mục staff đã tích phải có phí (>= 0); hạng mục không tích thì không được nhập.
            java.util.Set<String> ticked = new java.util.LinkedHashSet<>(itemList(ur));
            if (ticked.isEmpty()) {
                ticked.add(DamageType.OTHER.name());
            }
            damageFee = BigDecimal.ZERO;
            java.util.List<String> parts = new java.util.ArrayList<>();
            for (String key : ticked) {
                BigDecimal fee = itemFees.get(key);
                if (fee == null || fee.signum() < 0) {
                    throw new BadRequestException("Vui lòng nhập phí (từ 0 trở lên) cho từng hạng mục hư hại đã báo");
                }
                damageFee = damageFee.add(fee);
                parts.add(key + "=" + fee.stripTrailingZeros().toPlainString());
            }
            for (String key : itemFees.keySet()) {
                if (!ticked.contains(key)) {
                    throw new BadRequestException("Hạng mục hư hại chưa được báo: " + key);
                }
            }
            breakdown = String.join(",", parts);
        } else {
            damageFee = totalFee;
        }
        if (damageFee == null || damageFee.signum() < 0) {
            throw new BadRequestException("Phí hư hại không được âm");
        }

        // Hủy hợp đồng sớm: chỉ ghi nhận phí hư hại; số hoàn / phải trả được tính khi quản lý xác nhận hủy.
        if (terminationRepository.findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(
                contract.getId(), List.of(TerminationStatus.INSPECTED)).isPresent()) {
            ur.setDamageFee(damageFee);
            ur.setDamageFeeBreakdown(breakdown);
            ur.setDamageStatus(DamageStatus.FEE_ISSUED);
            ur.setDamageFeeIssuedAt(LocalDateTime.now());
            ur.setDamageFeeIssuedBy(caller);
            UnitReturn done = unitReturnRepository.save(ur);
            notifier.notifyFacilityManagers(unit.getFacility().getId(), "Damage fee set for early termination",
                    "Đã chốt phí hư hại, có thể xác nhận hủy",
                    "Phí hư hại ô " + unit.getUnitCode() + " đã chốt. Bạn có thể xác nhận hủy hợp đồng.", "/admin/terminations");
            return toResponse(done, unit, null);
        }

        // Phải tính trước khi hoàn cọc (hoàn xong thì khoản cọc không còn ở trạng thái PAID).
        BigDecimal coveredByDeposit = depositCovering(contract, damageFee);
        BigDecimal toBill = damageFee.subtract(coveredByDeposit);

        Payment damagePayment = null;
        if (toBill.signum() > 0) {
            damagePayment = new Payment();
            damagePayment.setCustomer(contract.getCustomer());
            damagePayment.setReservation(contract.getReservation());
            damagePayment.setRentalContract(contract);
            damagePayment.setPaymentType(PaymentType.DAMAGE_FEE);
            damagePayment.setAmount(toBill);
            damagePayment.setStatus(PaymentStatus.PENDING);
            damagePayment = paymentRepository.save(damagePayment);
        }
        rentalContractService.refundDepositOnReturn(contract, damageFee);

        ur.setDamageFee(damageFee);
        ur.setDamageFeeBreakdown(breakdown);
        ur.setDamageStatus(DamageStatus.FEE_ISSUED);
        ur.setDamageFeeIssuedAt(LocalDateTime.now());
        ur.setDamageFeeIssuedBy(caller);
        UnitReturn saved = unitReturnRepository.save(ur);

        String how;
        if (damageFee.signum() == 0) {
            how = "No damage fee is charged, your full deposit is refunded.";
        } else if (toBill.signum() > 0) {
            how = "Damage fee: " + damageFee + ", of which " + coveredByDeposit + " was deducted from your deposit. "
                    + "Please settle the remaining " + toBill + ".";
        } else {
            how = "Damage fee: " + damageFee + ", deducted from your deposit refund. Nothing more to pay.";
        }
        notifier.notifyUser(contract.getCustomer(), "Damage fee for your returned unit", "The damage fee is confirmed",
                "Unit " + unit.getUnitCode() + " (" + describeDamage(saved) + ")\n" + how, "/account/payments");
        return toResponse(saved, unit, damagePayment);
    }

    @Transactional(readOnly = true)
    public List<UnitReturnResponse> listDamage(Long facilityId, DamageStatus damageStatus) {
        Users caller = currentUser.get();
        Long scoped = facilityId;
        if (caller.getRole() != Role.SYSTEM_ADMIN) {
            Long own = currentUser.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(own)) {
                throw new AccessDeniedException("Bạn không có quyền truy cập cơ sở " + facilityId);
            }
            scoped = own;
        }
        return unitReturnRepository.searchDamage(scoped, damageStatus).stream()
                .map(ur -> toResponse(ur, ur.getRentalContract().getStorageUnit(), null)).toList();
    }

    @Transactional(readOnly = true)
    public UnitReturnResponse get(Integer id) {
        Users caller = currentUser.get();
        UnitReturn ur = unitReturnRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy biên bản trả kho: " + id));
        StorageUnit unit = ur.getRentalContract().getStorageUnit();
        if (caller.getRole() == Role.CUSTOMER) {
            if (!ur.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Không tìm thấy biên bản trả kho: " + id);
            }
        } else {
            currentUser.assertFacilityAccess(caller, unit.getFacility().getId());
        }
        return toResponse(ur, unit, null);
    }

    // Lịch RETURN được chỉ định, hoặc lịch RETURN đang chờ của hợp đồng; null nếu khách trả không hẹn trước.
    private Appointment resolveReturnAppointment(UnitReturnRequest req, RentalContract contract, Users staff) {
        Appointment appointment;
        if (req.getAppointmentId() != null) {
            appointment = appointmentRepository.findById(req.getAppointmentId())
                    .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy lịch hẹn: " + req.getAppointmentId()));
            if (appointment.getAppointmentType() != AppointmentType.RETURN
                    || appointment.getRentalContract() == null
                    || !appointment.getRentalContract().getId().equals(contract.getId())) {
                throw new BadRequestException("Lịch hẹn " + req.getAppointmentId()
                        + " không phải lịch trả kho của hợp đồng này");
            }
            if (appointment.getStatus() != AppointmentStatus.SCHEDULED) {
                throw new BadRequestException("Lịch hẹn đang ở trạng thái " + appointment.getStatus() + ", expected SCHEDULED");
            }
        } else {
            List<Appointment> pending = appointmentRepository.findByRentalContract_IdAndAppointmentTypeAndStatus(
                    contract.getId(), AppointmentType.RETURN, AppointmentStatus.SCHEDULED);
            appointment = pending.isEmpty() ? null : pending.get(0);
        }
        if (appointment != null) {
            if (appointment.getStaff() == null) {
                appointment.setStaff(staff);
            } else if (!appointment.getStaff().getId().equals(staff.getId())) {
                throw new AccessDeniedException("Lịch trả kho này được gán cho nhân viên khác");
            }
        }
        return appointment;
    }

    // Phần phí hư hại mà tiền cọc đã nộp (PAID) gánh được; chưa có cọc PAID thì 0 (cùng quy tắc của refundDepositOnReturn).
    private BigDecimal depositCovering(RentalContract contract, BigDecimal damageFee) {
        Optional<Payment> deposit = contract.getReservation() == null ? Optional.empty()
                : paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getReservation().getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        if (deposit.isEmpty()) {
            deposit = paymentRepository.findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                    contract.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        }
        if (deposit.isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal base = contract.getDepositAmount() != null ? contract.getDepositAmount() : deposit.get().getAmount();
        return damageFee.min(base.max(BigDecimal.ZERO));
    }

    private static List<String> itemList(UnitReturn ur) {
        return ur.getDamageItems() == null || ur.getDamageItems().isBlank() ? Collections.emptyList()
                : Arrays.asList(ur.getDamageItems().split(","));
    }

    private static java.util.Map<String, BigDecimal> feeMap(UnitReturn ur) {
        java.util.Map<String, BigDecimal> m = new java.util.LinkedHashMap<>();
        if (ur.getDamageFeeBreakdown() != null && !ur.getDamageFeeBreakdown().isBlank()) {
            for (String part : ur.getDamageFeeBreakdown().split(",")) {
                String[] kv = part.split("=");
                if (kv.length == 2) {
                    m.put(kv[0], new BigDecimal(kv[1]));
                }
            }
        }
        return m;
    }

    private static String describeDamage(UnitReturn ur) {
        String items = itemList(ur).stream().map(s -> s.toLowerCase().replace('_', ' ')).collect(Collectors.joining(", "));
        String other = ur.getDamageDescription();
        if (items.isEmpty()) {
            return other == null ? "damage" : other;
        }
        return other == null ? items : items + " (" + other + ")";
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private UnitReturnResponse toResponse(UnitReturn ur, StorageUnit unit, Payment damagePayment) {
        return UnitReturnResponse.builder()
                .id(ur.getId())
                .rentalContractId(ur.getRentalContract().getId())
                .customerId(ur.getCustomer().getId())
                .customerName(ur.getCustomer().getFullname())
                .staffId(ur.getStaff().getId())
                .staffName(ur.getStaff().getFullname())
                .storageUnitId(unit.getId())
                .unitCode(unit.getUnitCode())
                .unitStatus(unit.getStatus())
                .facilityName(unit.getFacility().getName())
                .returnedAt(ur.getReturnedAt())
                .unitCondition(ur.getUnitCondition())
                .hasDamage(ur.isHasDamage())
                .damageItems(itemList(ur))
                .damageDescription(ur.getDamageDescription())
                .damageStatus(ur.getDamageStatus())
                .damageFee(ur.getDamageFee())
                .damageItemFees(feeMap(ur))
                .damageFeeIssuedAt(ur.getDamageFeeIssuedAt())
                .damageFeeIssuedByName(ur.getDamageFeeIssuedBy() != null ? ur.getDamageFeeIssuedBy().getFullname() : null)
                .damagePaymentId(damagePayment != null ? damagePayment.getId() : null)
                .notes(ur.getNotes())
                .createdAt(ur.getCreatedAt())
                .build();
    }
}

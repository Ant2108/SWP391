package com.example.storage_api.service;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.entity.ContractStatus;
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
import java.util.List;

/**
 * Nghiệp vụ trả kho. Khách đến trả -> staff kiểm tra unit -> tạo UnitReturn:
 *  - Không hư hại: StorageUnit -> AVAILABLE, RentalContract -> COMPLETED.
 *  - Có hư hại: StorageUnit -> MAINTENANCE, RentalContract -> COMPLETED, tạo Payment DAMAGE_FEE (PENDING)
 *    cho khách. Phí quá hạn (overdue) do module hợp đồng/thanh toán xử lý, không tính ở đây.
 * Lịch RETURN liên quan (nếu có) được đóng COMPLETED trong cùng transaction.
 */
@Service
@RequiredArgsConstructor
public class UnitReturnService {

    private final UnitReturnRepository unitReturnRepository;
    private final RentalContractRepository rentalContractRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    @Transactional
    public UnitReturnResponse create(UnitReturnRequest req) {
        Users staff = currentUser.get();
        RentalContract contract = rentalContractRepository.findById(req.getRentalContractId())
                .orElseThrow(() -> new ResourceNotFoundException("Rental contract not found: " + req.getRentalContractId()));
        StorageUnit unit = contract.getStorageUnit();
        currentUser.assertFacilityAccess(staff, unit.getFacility().getId());

        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new BadRequestException("Only ACTIVE or OVERDUE contracts can be returned (current: "
                    + contract.getStatus() + ")");
        }
        if (unitReturnRepository.existsByRentalContract_Id(contract.getId())) {
            throw new ConflictException("This contract has already been returned");
        }

        boolean damaged = Boolean.TRUE.equals(req.getHasDamage());
        String damageDescription = null;
        BigDecimal damageFee = null;
        if (damaged) {
            if (req.getDamageDescription() == null || req.getDamageDescription().isBlank()) {
                throw new BadRequestException("Damage description is required when the unit is damaged");
            }
            if (req.getDamageFee() == null || req.getDamageFee().signum() <= 0) {
                throw new BadRequestException("Damage fee must be greater than 0 when the unit is damaged");
            }
            damageDescription = req.getDamageDescription().trim();
            damageFee = req.getDamageFee();
        }

        Appointment appointment = resolveReturnAppointment(req, contract, staff);

        UnitReturn ur = new UnitReturn();
        ur.setRentalContract(contract);
        ur.setCustomer(contract.getCustomer());
        ur.setStaff(staff);
        ur.setReturnedAt(LocalDateTime.now());
        ur.setUnitCondition(blankToNull(req.getUnitCondition()));
        ur.setHasDamage(damaged);
        ur.setDamageDescription(damageDescription);
        ur.setDamageFee(damageFee);
        ur.setNotes(blankToNull(req.getNotes()));
        UnitReturn saved = unitReturnRepository.save(ur);

        contract.setStatus(ContractStatus.COMPLETED);
        unit.setStatus(damaged ? UnitStatus.MAINTENANCE : UnitStatus.AVAILABLE);
        rentalContractRepository.save(contract);
        storageUnitRepository.save(unit);

        Payment damagePayment = null;
        if (damaged) {
            damagePayment = new Payment();
            damagePayment.setCustomer(contract.getCustomer());
            damagePayment.setReservation(contract.getReservation());
            damagePayment.setRentalContract(contract);
            damagePayment.setPaymentType(PaymentType.DAMAGE_FEE);
            damagePayment.setAmount(damageFee);
            damagePayment.setStatus(PaymentStatus.PENDING);
            damagePayment = paymentRepository.save(damagePayment);
        }

        if (appointment != null) {
            appointment.setStatus(AppointmentStatus.COMPLETED);
            appointmentRepository.save(appointment);
        }

        if (damaged) {
            notifier.notifyUser(contract.getCustomer(), "Damage fee for your returned unit", "A damage fee was issued",
                    "Unit " + unit.getUnitCode() + " was returned with damage: " + damageDescription
                            + "\nDamage fee: " + damageFee + ". Please settle this payment.", "/account/payments");
        } else {
            notifier.notifyUser(contract.getCustomer(), "Unit returned", "Your unit was returned",
                    "Unit " + unit.getUnitCode() + " was returned and inspected with no damage. "
                            + "Your rental contract is now completed. Thank you!", "/account/units");
        }
        return toResponse(saved, unit, damagePayment);
    }

    @Transactional(readOnly = true)
    public UnitReturnResponse get(Integer id) {
        Users caller = currentUser.get();
        UnitReturn ur = unitReturnRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Unit return not found: " + id));
        StorageUnit unit = ur.getRentalContract().getStorageUnit();
        if (caller.getRole() == Role.CUSTOMER) {
            if (!ur.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Unit return not found: " + id);
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
                    .orElseThrow(() -> new ResourceNotFoundException("Appointment not found: " + req.getAppointmentId()));
            if (appointment.getAppointmentType() != AppointmentType.RETURN
                    || appointment.getRentalContract() == null
                    || !appointment.getRentalContract().getId().equals(contract.getId())) {
                throw new BadRequestException("Appointment " + req.getAppointmentId()
                        + " is not a RETURN appointment of this contract");
            }
            if (appointment.getStatus() != AppointmentStatus.SCHEDULED) {
                throw new BadRequestException("Appointment is " + appointment.getStatus() + ", expected SCHEDULED");
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
                throw new AccessDeniedException("This return appointment is assigned to another staff member");
            }
        }
        return appointment;
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
                .returnedAt(ur.getReturnedAt())
                .unitCondition(ur.getUnitCondition())
                .hasDamage(ur.isHasDamage())
                .damageDescription(ur.getDamageDescription())
                .damageFee(ur.getDamageFee())
                .damagePaymentId(damagePayment != null ? damagePayment.getId() : null)
                .notes(ur.getNotes())
                .createdAt(ur.getCreatedAt())
                .build();
    }
}

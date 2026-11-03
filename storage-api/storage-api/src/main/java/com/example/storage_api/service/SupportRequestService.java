package com.example.storage_api.service;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportRequest;
import com.example.storage_api.entity.SupportStatus;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.SupportRequestResponse;
import com.example.storage_api.model.request.SupportRequestCreateRequest;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.SupportRequestRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Nghiệp vụ Support Request.
 * Customer tạo (OPEN) -> Facility Manager gán staff -> Staff IN_PROGRESS -> RESOLVED
 * -> Manager hoặc Customer xác nhận CLOSED. Không cho nhảy cóc hoặc quay lại trạng thái trước.
 */
@Service
@RequiredArgsConstructor
public class SupportRequestService {

    private static final String PATH = "/account/support";

    private final SupportRequestRepository supportRequestRepository;
    private final RentalContractRepository rentalContractRepository;
    private final UsersRepository usersRepository;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    @Transactional
    public SupportRequestResponse create(SupportRequestCreateRequest req) {
        Users customer = currentUser.get();
        RentalContract contract = rentalContractRepository.findById(req.getRentalContractId())
                .orElseThrow(() -> new ResourceNotFoundException("Rental contract not found: " + req.getRentalContractId()));
        if (!contract.getCustomer().getId().equals(customer.getId())) {
            throw new ResourceNotFoundException("Rental contract not found: " + req.getRentalContractId());
        }
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new BadRequestException("Support requests can only be sent for ACTIVE or OVERDUE contracts (current: "
                    + contract.getStatus() + ")");
        }

        StorageUnit unit = contract.getStorageUnit();
        SupportRequest r = new SupportRequest();
        r.setCustomer(customer);
        r.setFacility(unit.getFacility());
        r.setRentalContract(contract);
        r.setStorageUnit(unit);
        r.setSupportType(req.getSupportType());
        r.setTitle(req.getTitle().trim());
        r.setDescription(req.getDescription() == null || req.getDescription().isBlank() ? null : req.getDescription().trim());
        r.setPriority(req.getPriority() != null ? req.getPriority() : SupportPriority.MEDIUM);
        SupportRequest saved = supportRequestRepository.save(r);

        usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_MANAGER, unit.getFacility().getId(), Status.ACTIVE)
                .forEach(m -> notifier.notifyUser(m, "New support request", "A customer needs support",
                        "Unit " + unit.getUnitCode() + " - " + saved.getTitle() + " (" + saved.getPriority() + ")"
                                + "\nCustomer: " + customer.getFullname() + ". Please assign a staff member.", null));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<SupportRequestResponse> myRequests() {
        Users caller = currentUser.get();
        return supportRequestRepository.findByCustomer_IdOrderByCreatedAtDesc(caller.getId()).stream()
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SupportRequestResponse> list(Long facilityId, SupportStatus status, SupportPriority priority, Long staffId) {
        Users caller = currentUser.get();
        Long facility = facilityId;
        if (caller.getRole() != Role.SYSTEM_ADMIN) {
            Long own = currentUser.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(own)) {
                throw new AccessDeniedException("You do not have access to facility " + facilityId);
            }
            facility = own;
        }
        return supportRequestRepository.search(facility, status, priority, staffId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SupportRequestResponse get(Integer id) {
        Users caller = currentUser.get();
        SupportRequest r = findOrThrow(id);
        if (caller.getRole() == Role.CUSTOMER) {
            if (!r.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Support request not found: " + id);
            }
        } else {
            currentUser.assertFacilityAccess(caller, r.getFacility().getId());
        }
        return toResponse(r);
    }

    @Transactional
    public SupportRequestResponse assign(Integer id, Long staffId) {
        Users caller = currentUser.get();
        SupportRequest r = findOrThrow(id);
        currentUser.assertManagerOfFacility(caller, r.getFacility().getId());
        if (r.getStatus() == SupportStatus.RESOLVED || r.getStatus() == SupportStatus.CLOSED) {
            throw new BadRequestException("Request is " + r.getStatus() + "; it can no longer be assigned");
        }
        Users staff = usersRepository.findById(staffId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff not found: " + staffId));
        currentUser.assertAssignableStaff(staff, r.getFacility().getId());
        r.setAssignedStaff(staff);
        SupportRequest saved = supportRequestRepository.save(r);

        notifier.notifyUser(staff, "Support request assigned", "You have a new support request",
                "Unit " + r.getStorageUnit().getUnitCode() + " - " + r.getTitle() + " (" + r.getPriority() + ")", null);
        notifier.notifyUser(r.getCustomer(), "Staff assigned to your support request", "Your request is being handled",
                "\"" + r.getTitle() + "\" is assigned to " + staff.getFullname() + ".", PATH);
        return toResponse(saved);
    }

    @Transactional
    public SupportRequestResponse updateStatus(Integer id, SupportStatus newStatus) {
        Users caller = currentUser.get();
        SupportRequest r = findOrThrow(id);

        switch (newStatus) {
            case IN_PROGRESS -> {
                requireCurrent(r, SupportStatus.OPEN, newStatus);
                if (r.getAssignedStaff() == null) {
                    throw new BadRequestException("Assign a staff member before starting work on this request");
                }
                assertStaffOrManager(caller, r);
            }
            case RESOLVED -> {
                requireCurrent(r, SupportStatus.IN_PROGRESS, newStatus);
                assertStaffOrManager(caller, r);
                r.setResolvedAt(LocalDateTime.now());
            }
            case CLOSED -> {
                requireCurrent(r, SupportStatus.RESOLVED, newStatus);
                assertCustomerOrManager(caller, r);
            }
            case OPEN -> throw new BadRequestException("A request cannot be moved back to OPEN");
        }
        r.setStatus(newStatus);
        SupportRequest saved = supportRequestRepository.save(r);

        if (newStatus == SupportStatus.RESOLVED) {
            notifier.notifyUser(r.getCustomer(), "Support request resolved", "Your request was resolved",
                    "\"" + r.getTitle() + "\" has been marked as resolved. If everything is fine you can close it, "
                            + "otherwise contact us again.", PATH);
        }
        return toResponse(saved);
    }

    private void requireCurrent(SupportRequest r, SupportStatus expected, SupportStatus target) {
        if (r.getStatus() != expected) {
            throw new BadRequestException("Cannot move a " + r.getStatus() + " request to " + target
                    + " (it must be " + expected + ")");
        }
    }

    // IN_PROGRESS / RESOLVED: staff được gán hoặc manager của cơ sở.
    private void assertStaffOrManager(Users caller, SupportRequest r) {
        if (caller.getRole() == Role.FACILITY_STAFF) {
            currentUser.assertFacilityAccess(caller, r.getFacility().getId());
            if (r.getAssignedStaff() == null || !r.getAssignedStaff().getId().equals(caller.getId())) {
                throw new AccessDeniedException("This support request is not assigned to you");
            }
        } else {
            currentUser.assertManagerOfFacility(caller, r.getFacility().getId());
        }
    }

    // CLOSED: chính khách tạo yêu cầu, hoặc manager của cơ sở.
    private void assertCustomerOrManager(Users caller, SupportRequest r) {
        if (caller.getRole() == Role.CUSTOMER) {
            if (!r.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Support request not found: " + r.getId());
            }
        } else {
            currentUser.assertManagerOfFacility(caller, r.getFacility().getId());
        }
    }

    private SupportRequest findOrThrow(Integer id) {
        return supportRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Support request not found: " + id));
    }

    private SupportRequestResponse toResponse(SupportRequest r) {
        return SupportRequestResponse.builder()
                .id(r.getId())
                .supportType(r.getSupportType())
                .title(r.getTitle())
                .description(r.getDescription())
                .priority(r.getPriority())
                .status(r.getStatus())
                .customerId(r.getCustomer().getId())
                .customerName(r.getCustomer().getFullname())
                .facilityId(r.getFacility().getId())
                .facilityName(r.getFacility().getName())
                .rentalContractId(r.getRentalContract().getId())
                .storageUnitId(r.getStorageUnit().getId())
                .unitCode(r.getStorageUnit().getUnitCode())
                .assignedStaffId(r.getAssignedStaff() != null ? r.getAssignedStaff().getId() : null)
                .assignedStaffName(r.getAssignedStaff() != null ? r.getAssignedStaff().getFullname() : null)
                .resolvedAt(r.getResolvedAt())
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}

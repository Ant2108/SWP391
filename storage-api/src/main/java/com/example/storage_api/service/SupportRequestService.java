package com.example.storage_api.service;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportReply;
import com.example.storage_api.entity.SupportRequest;
import com.example.storage_api.entity.SupportStatus;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.SupportReplyResponse;
import com.example.storage_api.model.reponse.SupportRequestResponse;
import com.example.storage_api.model.request.SupportRequestCreateRequest;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.SupportReplyRepository;
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
 * Customer tạo (OPEN) -> staff / manager của cơ sở trả lời và xử lý (IN_PROGRESS -> RESOLVED, không cần được gán
 * trước; manager vẫn có thể gán một staff phụ trách) -> Manager hoặc Customer xác nhận CLOSED.
 * Không cho nhảy cóc hoặc quay lại trạng thái trước.
 */
@Service
@RequiredArgsConstructor
public class SupportRequestService {

    private static final String PATH = "/account/support";

    private final SupportRequestRepository supportRequestRepository;
    private final SupportReplyRepository supportReplyRepository;
    private final RentalContractRepository rentalContractRepository;
    private final UsersRepository usersRepository;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    @Transactional
    public SupportRequestResponse create(SupportRequestCreateRequest req) {
        Users customer = currentUser.get();
        RentalContract contract = rentalContractRepository.findById(req.getRentalContractId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + req.getRentalContractId()));
        if (!contract.getCustomer().getId().equals(customer.getId())) {
            throw new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + req.getRentalContractId());
        }
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new BadRequestException("Chỉ gửi được yêu cầu hỗ trợ cho hợp đồng đang thuê hoặc quá hạn (hiện tại: "
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
                                + "\nCustomer: " + customer.getFullname() + ". You or your staff can reply right away.", "/admin/support-requests"));
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
                throw new AccessDeniedException("Bạn không có quyền truy cập cơ sở " + facilityId);
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
                throw new ResourceNotFoundException("Không tìm thấy yêu cầu hỗ trợ: " + id);
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
            throw new BadRequestException("Yêu cầu đã ở trạng thái " + r.getStatus() + ", không thể phân công thêm");
        }
        Users staff = usersRepository.findById(staffId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy nhân viên: " + staffId));
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
                assertStaffOrManager(caller, r);
                claimIfUnassigned(caller, r);
            }
            case RESOLVED -> {
                requireCurrent(r, SupportStatus.IN_PROGRESS, newStatus);
                assertStaffOrManager(caller, r);
                claimIfUnassigned(caller, r);
                r.setResolvedAt(LocalDateTime.now());
            }
            case CLOSED -> {
                requireCurrent(r, SupportStatus.RESOLVED, newStatus);
                assertCustomerOrManager(caller, r);
            }
            case OPEN -> throw new BadRequestException("Không thể chuyển yêu cầu về trạng thái mới mở");
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

    /**
     * Trả lời trong yêu cầu. Khách (chủ yêu cầu) hoặc staff / manager của cơ sở đều viết được, không cần gán trước.
     * Nhân viên trả lời yêu cầu đang OPEN thì yêu cầu chuyển IN_PROGRESS (staff chưa có người phụ trách thì tự nhận);
     * khách trả lời yêu cầu đã RESOLVED thì mở lại thành IN_PROGRESS. Yêu cầu đã CLOSED thì không trả lời nữa.
     */
    @Transactional
    public SupportRequestResponse reply(Integer id, String message) {
        Users caller = currentUser.get();
        SupportRequest r = findOrThrow(id);
        boolean byCustomer = caller.getRole() == Role.CUSTOMER;
        if (byCustomer) {
            if (!r.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Không tìm thấy yêu cầu hỗ trợ: " + id);
            }
        } else if (currentUser.isStaffOrManager(caller)) {
            currentUser.assertFacilityAccess(caller, r.getFacility().getId());
        } else {
            throw new AccessDeniedException("Bạn không có quyền phản hồi yêu cầu hỗ trợ");
        }
        if (r.getStatus() == SupportStatus.CLOSED) {
            throw new BadRequestException("Yêu cầu này đã đóng; vui lòng gửi yêu cầu mới");
        }
        String text = message.trim();

        SupportReply reply = new SupportReply();
        reply.setSupportRequest(r);
        reply.setAuthor(caller);
        reply.setMessage(text);
        supportReplyRepository.save(reply);

        if (byCustomer) {
            if (r.getStatus() == SupportStatus.RESOLVED) {
                r.setStatus(SupportStatus.IN_PROGRESS);
                r.setResolvedAt(null);
            }
            String note = "Unit " + r.getStorageUnit().getUnitCode() + " - \"" + r.getTitle() + "\" ("
                    + r.getCustomer().getFullname() + "):\n" + text;
            if (r.getAssignedStaff() != null) {
                notifier.notifyUser(r.getAssignedStaff(), "Customer replied", "A customer replied to a support request",
                        note, "/admin/support-requests");
            } else {
                notifier.notifyFacilityManagers(r.getFacility().getId(), "Customer replied",
                        "A customer replied to a support request", note, "/admin/support-requests");
            }
        } else {
            if (r.getStatus() == SupportStatus.OPEN) {
                r.setStatus(SupportStatus.IN_PROGRESS);
            }
            claimIfUnassigned(caller, r);
            notifier.notifyUser(r.getCustomer(), "New reply to your support request", "We replied to your request",
                    "\"" + r.getTitle() + "\" - " + caller.getFullname() + ":\n" + text, PATH);
        }
        return toResponse(supportRequestRepository.save(r));
    }

    private void requireCurrent(SupportRequest r, SupportStatus expected, SupportStatus target) {
        if (r.getStatus() != expected) {
            throw new BadRequestException("Không thể chuyển yêu cầu từ " + r.getStatus() + " sang " + target
                    + " (yêu cầu phải đang ở trạng thái " + expected + ")");
        }
    }

    // IN_PROGRESS / RESOLVED: staff hoặc manager của cơ sở (không cần được gán trước).
    private void assertStaffOrManager(Users caller, SupportRequest r) {
        if (caller.getRole() == Role.FACILITY_STAFF) {
            currentUser.assertFacilityAccess(caller, r.getFacility().getId());
        } else {
            currentUser.assertManagerOfFacility(caller, r.getFacility().getId());
        }
    }

    // Staff xử lý một yêu cầu chưa có người phụ trách thì tự nhận luôn.
    private void claimIfUnassigned(Users caller, SupportRequest r) {
        if (r.getAssignedStaff() == null && caller.getRole() == Role.FACILITY_STAFF) {
            r.setAssignedStaff(caller);
        }
    }

    // CLOSED: chính khách tạo yêu cầu, hoặc manager của cơ sở.
    private void assertCustomerOrManager(Users caller, SupportRequest r) {
        if (caller.getRole() == Role.CUSTOMER) {
            if (!r.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Không tìm thấy yêu cầu hỗ trợ: " + r.getId());
            }
        } else {
            currentUser.assertManagerOfFacility(caller, r.getFacility().getId());
        }
    }

    private SupportRequest findOrThrow(Integer id) {
        return supportRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu hỗ trợ: " + id));
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
                .replies(supportReplyRepository.findBySupportRequest_IdOrderByCreatedAtAscIdAsc(r.getId()).stream()
                        .map(this::toReplyResponse).toList())
                .build();
    }

    private SupportReplyResponse toReplyResponse(SupportReply p) {
        return SupportReplyResponse.builder()
                .id(p.getId())
                .authorId(p.getAuthor().getId())
                .authorName(p.getAuthor().getFullname())
                .authorRole(p.getAuthor().getRole().name())
                .staffReply(p.getAuthor().getRole() != Role.CUSTOMER)
                .message(p.getMessage())
                .createdAt(p.getCreatedAt())
                .build();
    }
}

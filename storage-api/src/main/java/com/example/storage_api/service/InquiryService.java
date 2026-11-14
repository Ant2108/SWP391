package com.example.storage_api.service;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.FacilityStatus;
import com.example.storage_api.entity.Inquiry;
import com.example.storage_api.entity.InquiryStatus;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.InquiryResponse;
import com.example.storage_api.model.request.InquiryCreateRequest;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.InquiryRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Câu hỏi từ trang Support, dùng được khi chưa đăng nhập. Khách chỉ cần để lại tên, email và câu hỏi.
 * Nhân viên / quản lý của cơ sở được chọn nhận thông báo, trả lời, và câu trả lời gửi về email của khách.
 */
@Service
@RequiredArgsConstructor
public class InquiryService {

    private final InquiryRepository inquiryRepository;
    private final FacilityRepository facilityRepository;
    private final UsersRepository usersRepository;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    // ===================== KHÁCH GỬI CÂU HỎI (CÔNG KHAI) =====================

    @Transactional
    public InquiryResponse create(InquiryCreateRequest req) {
        // Ô ẩn chống bot có nội dung: giả vờ thành công nhưng không lưu gì.
        if (req.getWebsite() != null && !req.getWebsite().isBlank()) {
            return InquiryResponse.builder().status(InquiryStatus.OPEN).build();
        }
        Facility facility = facilityRepository.findById(req.getFacilityId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy cơ sở: " + req.getFacilityId()));
        if (facility.getStatus() == FacilityStatus.INACTIVE) {
            throw new BadRequestException("Cơ sở này hiện không khả dụng");
        }
        Inquiry i = new Inquiry();
        i.setFacility(facility);
        i.setName(req.getName().trim());
        i.setEmail(req.getEmail().trim().toLowerCase());
        i.setPhone(blankToNull(req.getPhone()));
        i.setSubject(req.getSubject().trim());
        i.setMessage(req.getMessage().trim());
        Inquiry saved = inquiryRepository.save(i);

        String text = saved.getName() + " asked: \"" + saved.getSubject() + "\". Please reply from the Inquiries page.";
        notifyStaffOf(facility.getId(), "New question from a visitor", "New question from a visitor", text);
        return toResponse(saved);
    }

    private void notifyStaffOf(Long facilityId, String subject, String heading, String text) {
        for (Role role : List.of(Role.FACILITY_MANAGER, Role.FACILITY_STAFF)) {
            usersRepository.findByRoleAndFacility_IdAndStatus(role, facilityId, Status.ACTIVE)
                    .forEach(u -> notifier.notifyUser(u, subject, heading, text, "/admin/inquiries"));
        }
    }

    // ===================== NHÂN VIÊN XEM / TRẢ LỜI =====================

    @Transactional(readOnly = true)
    public List<InquiryResponse> list(Long facilityId, InquiryStatus status) {
        Users caller = currentUser.get();
        Long scoped = facilityId;
        if (caller.getRole() != Role.SYSTEM_ADMIN) {
            Long own = currentUser.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(own)) {
                throw new AccessDeniedException("Bạn không có quyền truy cập cơ sở " + facilityId);
            }
            scoped = own;
        }
        return inquiryRepository.search(scoped, status).stream().map(this::toResponse).toList();
    }

    /** Câu hỏi (và câu trả lời) của khách đang đăng nhập, tìm theo email tài khoản. */
    @Transactional(readOnly = true)
    public List<InquiryResponse> mine() {
        Users caller = currentUser.get();
        return inquiryRepository.findByEmail(caller.getEmail().trim()).stream().map(this::toResponse).toList();
    }

    @Transactional
    public InquiryResponse answer(Integer id, String answer) {
        Users caller = currentUser.get();
        if (caller.getRole() != Role.FACILITY_STAFF && caller.getRole() != Role.FACILITY_MANAGER) {
            throw new AccessDeniedException("Chỉ nhân viên hoặc quản lý cơ sở mới trả lời được câu hỏi");
        }
        Inquiry i = inquiryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy câu hỏi: " + id));
        currentUser.assertFacilityAccess(caller, i.getFacility().getId());
        if (i.getStatus() == InquiryStatus.ANSWERED) {
            throw new ConflictException("Câu hỏi này đã được trả lời");
        }
        i.setAnswer(answer.trim());
        i.setAnsweredBy(caller);
        i.setAnsweredAt(LocalDateTime.now());
        i.setStatus(InquiryStatus.ANSWERED);
        Inquiry saved = inquiryRepository.save(i);

        String heading = "We answered your question";
        String body = "Your question: \"" + saved.getSubject() + "\"\n\nOur answer: " + saved.getAnswer()
                + "\n\nFacility: " + saved.getFacility().getName();
        // Nếu người hỏi có tài khoản thì thêm cả thông báo trong app (kèm email); không thì chỉ gửi email.
        usersRepository.findByEmailIgnoreCase(saved.getEmail()).ifPresentOrElse(
                u -> notifier.notifyUser(u, "Answer to your question", heading, body, null),
                () -> notifier.emailAddress(saved.getEmail(), saved.getName(), "Answer to your question", heading, body));
        return toResponse(saved);
    }

    private InquiryResponse toResponse(Inquiry i) {
        return InquiryResponse.builder()
                .id(i.getId())
                .facilityId(i.getFacility().getId())
                .facilityName(i.getFacility().getName())
                .name(i.getName())
                .email(i.getEmail())
                .phone(i.getPhone())
                .subject(i.getSubject())
                .message(i.getMessage())
                .status(i.getStatus())
                .answer(i.getAnswer())
                .answeredByName(i.getAnsweredBy() != null ? i.getAnsweredBy().getFullname() : null)
                .answeredAt(i.getAnsweredAt())
                .createdAt(i.getCreatedAt())
                .build();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

package com.example.storage_api.controller;

import com.example.storage_api.entity.InquiryStatus;
import com.example.storage_api.model.reponse.InquiryResponse;
import com.example.storage_api.model.request.InquiryAnswerRequest;
import com.example.storage_api.model.request.InquiryCreateRequest;
import com.example.storage_api.service.InquiryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Câu hỏi từ trang Support. POST công khai (khách chưa có tài khoản cũng gửi được, SecurityConfig mở đúng đường dẫn này);
 * xem danh sách và trả lời chỉ dành cho nhân viên / quản lý cơ sở (admin chỉ xem).
 */
@RestController
@RequestMapping("/api/inquiries")
@RequiredArgsConstructor
public class InquiryController {

    private final InquiryService inquiryService;

    @PostMapping
    public ResponseEntity<InquiryResponse> create(@Valid @RequestBody InquiryCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(inquiryService.create(request));
    }

    // GET /api/inquiries/my -> khách đăng nhập xem lại câu hỏi mình đã gửi (theo email tài khoản) và câu trả lời.
    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<InquiryResponse> my() {
        return inquiryService.mine();
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public List<InquiryResponse> list(@RequestParam(required = false) Long facilityId,
                                      @RequestParam(required = false) InquiryStatus status) {
        return inquiryService.list(facilityId, status);
    }

    @PatchMapping("/{id}/answer")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','FACILITY_STAFF')")
    public InquiryResponse answer(@PathVariable Integer id, @Valid @RequestBody InquiryAnswerRequest request) {
        return inquiryService.answer(id, request.getAnswer());
    }
}

package com.example.storage_api.controller;

import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportStatus;
import com.example.storage_api.model.reponse.SupportRequestResponse;
import com.example.storage_api.model.request.AppointmentAssignRequest;
import com.example.storage_api.model.request.SupportRequestCreateRequest;
import com.example.storage_api.model.request.SupportStatusRequest;
import com.example.storage_api.service.SupportRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** API Support Request. Quyền theo role ở đây; quyền theo cơ sở / theo chủ yêu cầu do Service kiểm tra. */
@RestController
@RequestMapping("/api/support-requests")
@RequiredArgsConstructor
public class SupportRequestController {

    private final SupportRequestService supportRequestService;

    // POST /api/support-requests -> customer gửi yêu cầu (OPEN). Trả 201.
    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    public ResponseEntity<SupportRequestResponse> create(@Valid @RequestBody SupportRequestCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(supportRequestService.create(request));
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<SupportRequestResponse> my() {
        return supportRequestService.myRequests();
    }

    // GET /api/support-requests?status=OPEN&priority=HIGH&staffId=3 (staff/manager: cơ sở của mình).
    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<SupportRequestResponse> list(@RequestParam(required = false) Long facilityId,
                                             @RequestParam(required = false) SupportStatus status,
                                             @RequestParam(required = false) SupportPriority priority,
                                             @RequestParam(required = false) Long staffId) {
        return supportRequestService.list(facilityId, status, priority, staffId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public SupportRequestResponse get(@PathVariable Integer id) {
        return supportRequestService.get(id);
    }

    // PATCH /api/support-requests/{id}/assign { "staffId": 3 } -> manager gán staff.
    @PatchMapping("/{id}/assign")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public SupportRequestResponse assign(@PathVariable Integer id, @Valid @RequestBody AppointmentAssignRequest request) {
        return supportRequestService.assign(id, request.getStaffId());
    }

    // PATCH /api/support-requests/{id}/status { "status": "IN_PROGRESS" }
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER')")
    public SupportRequestResponse updateStatus(@PathVariable Integer id, @Valid @RequestBody SupportStatusRequest request) {
        return supportRequestService.updateStatus(id, request.getStatus());
    }
}

package com.example.storage_api.controller;

import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.model.reponse.AppointmentResponse;
import com.example.storage_api.model.reponse.BookingOptionsResponse;
import com.example.storage_api.model.reponse.StaffOptionResponse;
import com.example.storage_api.model.request.AppointmentAssignRequest;
import com.example.storage_api.model.request.AppointmentCompleteRequest;
import com.example.storage_api.model.request.AppointmentCreateRequest;
import com.example.storage_api.model.request.AppointmentRescheduleRequest;
import com.example.storage_api.model.request.NoShowReportRequest;
import com.example.storage_api.service.AppointmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * API Appointment (check-in / return / support).
 * Quyền theo role ở đây; quyền theo cơ sở và theo "lịch của ai" do AppointmentService kiểm tra.
 */
@RestController
@RequestMapping("/api/appointments")
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentService appointmentService;

    // POST /api/appointments -> customer đặt lịch; staff/manager đặt hộ khách (kèm customerId). Trả 201.
    @PostMapping
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER')")
    public ResponseEntity<AppointmentResponse> create(@Valid @RequestBody AppointmentCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(appointmentService.create(request));
    }

    // GET /api/appointments/my -> lịch của customer đang đăng nhập.
    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<AppointmentResponse> my() {
        return appointmentService.myAppointments();
    }

    // GET /api/appointments/booking-options -> reservation/hợp đồng customer được phép đặt lịch (cho form đặt lịch & support).
    @GetMapping("/booking-options")
    @PreAuthorize("hasRole('CUSTOMER')")
    public BookingOptionsResponse bookingOptions() {
        return appointmentService.bookingOptions();
    }

    // GET /api/appointments/staff -> staff đang hoạt động của cơ sở của manager (để chọn khi gán).
    @GetMapping("/staff")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public List<StaffOptionResponse> facilityStaff() {
        return appointmentService.facilityStaff();
    }

    // GET /api/appointments?type=CHECK_IN&status=SCHEDULED&date=2026-10-20&staffId=3&noShowReported=true
    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<AppointmentResponse> list(@RequestParam(required = false) Long facilityId,
                                          @RequestParam(required = false) AppointmentType type,
                                          @RequestParam(required = false) AppointmentStatus status,
                                          @RequestParam(required = false) Long staffId,
                                          @RequestParam(required = false)
                                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                          @RequestParam(defaultValue = "false") boolean noShowReported) {
        return appointmentService.list(facilityId, type, status, staffId, date, noShowReported);
    }

    // GET /api/appointments/today -> staff: lịch được gán cho mình hôm nay; manager: cả cơ sở.
    @GetMapping("/today")
    @PreAuthorize("hasAnyRole('FACILITY_STAFF','FACILITY_MANAGER')")
    public List<AppointmentResponse> today() {
        return appointmentService.today();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public AppointmentResponse get(@PathVariable Integer id) {
        return appointmentService.get(id);
    }

    // PATCH /api/appointments/{id}/assign { "staffId": 3 } -> manager gán staff.
    @PatchMapping("/{id}/assign")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public AppointmentResponse assign(@PathVariable Integer id, @Valid @RequestBody AppointmentAssignRequest request) {
        return appointmentService.assign(id, request.getStaffId());
    }

    // PATCH /api/appointments/{id}/complete { "keyHandedOver": true, "notes": "..." } -> hoàn tất (check-in).
    @PatchMapping("/{id}/complete")
    @PreAuthorize("hasAnyRole('FACILITY_STAFF','FACILITY_MANAGER')")
    public AppointmentResponse complete(@PathVariable Integer id,
                                        @Valid @RequestBody(required = false) AppointmentCompleteRequest request) {
        return appointmentService.complete(id, request != null ? request : new AppointmentCompleteRequest());
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_MANAGER')")
    public AppointmentResponse cancel(@PathVariable Integer id) {
        return appointmentService.cancel(id);
    }

    @PatchMapping("/{id}/reschedule")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public AppointmentResponse reschedule(@PathVariable Integer id,
                                          @Valid @RequestBody AppointmentRescheduleRequest request) {
        return appointmentService.reschedule(id, request);
    }

    @PatchMapping("/{id}/no-show")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public AppointmentResponse markNoShow(@PathVariable Integer id) {
        return appointmentService.markNoShow(id);
    }

    // POST /api/appointments/{id}/report-no-show { "note": "..." } -> staff báo khách vắng (không đổi status).
    @PostMapping("/{id}/report-no-show")
    @PreAuthorize("hasRole('FACILITY_STAFF')")
    public AppointmentResponse reportNoShow(@PathVariable Integer id, @Valid @RequestBody NoShowReportRequest request) {
        return appointmentService.reportNoShow(id, request);
    }
}

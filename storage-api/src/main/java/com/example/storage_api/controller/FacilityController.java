package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.FacilityResponse;
import com.example.storage_api.model.request.FacilityRequest;
import com.example.storage_api.service.FacilityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controller = "cửa vào" của API. Nó chỉ làm 3 việc: nhận request HTTP, giao cho Service xử lý, trả kết quả.
 * KHÔNG viết logic nghiệp vụ ở đây.
 *
 * Luồng: Postman -> HTTP request -> FacilityController -> FacilityService -> Repository -> SQL Server,
 *        rồi kết quả đi ngược lại thành JSON.
 *
 * Quyền: ghi (POST/PUT/PATCH) cho FACILITY_MANAGER hoặc BUSINESS_MANAGER.
 *        Đọc (GET): mọi user đã đăng nhập (theo cấu hình SecurityConfig hiện có).
 */
@RestController // Class này trả dữ liệu JSON (không phải trang HTML)
@RequestMapping("/api/facilities") // Mọi URL trong class này đều bắt đầu bằng /api/facilities
@RequiredArgsConstructor // Spring tự truyền FacilityService vào constructor
public class FacilityController {

    private final FacilityService facilityService;

    // GET /api/facilities -> danh sách tất cả Facility.
    @GetMapping
    public List<FacilityResponse> getFacilities() {
        return facilityService.getFacilities();
    }

    // GET /api/facilities/4 -> chi tiết Facility id = 4.
    // @PathVariable: lấy số 4 trong URL gán vào biến id.
    @GetMapping("/{id}")
    public FacilityResponse getFacility(@PathVariable Long id) {
        return facilityService.getFacility(id);
    }

    // POST /api/facilities -> tạo mới.
    // @PreAuthorize: chỉ cho vào nếu user đúng role (nếu không -> 403 Forbidden).
    // Tạo mới và vô hiệu hóa cơ sở: chỉ Business Manager. Sửa thông tin: Facility Manager (chỉ cơ sở của mình, kiểm tra ở Service) và Business Manager.
    // @RequestBody: lấy JSON trong body đổi thành FacilityRequest. @Valid: kiểm tra các @NotBlank... (sai -> 400).
    // Trả HTTP 201 Created kèm dữ liệu vừa tạo.
    @PostMapping
    @PreAuthorize("hasRole('BUSINESS_MANAGER')")
    public ResponseEntity<FacilityResponse> create(@Valid @RequestBody FacilityRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(facilityService.create(request));
    }

    // PUT /api/facilities/4 -> sửa toàn bộ thông tin Facility 4.
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER')")
    public FacilityResponse update(@PathVariable Long id, @Valid @RequestBody FacilityRequest request) {
        return facilityService.update(id, request);
    }

    // PATCH /api/facilities/4/disable -> tắt Facility 4 (không có body, không xoá dữ liệu).
    @PatchMapping("/{id}/disable")
    @PreAuthorize("hasRole('BUSINESS_MANAGER')")
    public FacilityResponse disable(@PathVariable Long id) {
        return facilityService.disable(id);
    }
}

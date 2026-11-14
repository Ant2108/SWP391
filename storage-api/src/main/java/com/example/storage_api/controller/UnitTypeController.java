package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.UnitTypeResponse;
import com.example.storage_api.model.request.UnitTypeRequest;
import com.example.storage_api.service.UnitTypeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * API cho UnitType (loại kho). Controller chỉ nhận request, giao cho UnitTypeService, trả kết quả.
 * Quyền: ghi chỉ FACILITY_MANAGER. Đọc: mọi user đã đăng nhập.
 */
@RestController
@RequestMapping("/api/unit-types") // Mọi URL bắt đầu bằng /api/unit-types
@RequiredArgsConstructor
public class UnitTypeController {

    private final UnitTypeService unitTypeService;

    // GET /api/unit-types?facilityId=1 -> các loại kho của Facility 1.
    // @RequestParam: lấy giá trị sau dấu "?" trong URL. Không có tham số facilityId -> tự trả 400.
    @GetMapping
    public List<UnitTypeResponse> getByFacility(@RequestParam Long facilityId) {
        return unitTypeService.getByFacility(facilityId);
    }

    // POST /api/unit-types -> tạo loại kho mới, trả 201 Created.
    @PostMapping
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public ResponseEntity<UnitTypeResponse> create(@Valid @RequestBody UnitTypeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(unitTypeService.create(request));
    }

    // PUT /api/unit-types/{id} -> sửa loại kho.
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public UnitTypeResponse update(@PathVariable Integer id, @Valid @RequestBody UnitTypeRequest request) {
        return unitTypeService.update(id, request);
    }

    // DELETE /api/unit-types/{id} -> xóa hẳn (chỉ khi chưa có dữ liệu liên quan).
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public org.springframework.http.ResponseEntity<Void> delete(@PathVariable Integer id) {
        unitTypeService.delete(id);
        return org.springframework.http.ResponseEntity.noContent().build();
    }

    // PATCH /api/unit-types/{id}/disable -> tắt loại kho (IsActive = false, không xoá).
    @PatchMapping("/{id}/disable")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public UnitTypeResponse disable(@PathVariable Integer id) {
        return unitTypeService.disable(id);
    }
}

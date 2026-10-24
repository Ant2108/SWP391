package com.example.storage_api.controller;

import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.model.reponse.StorageUnitResponse;
import com.example.storage_api.model.request.ChangeUnitStatusRequest;
import com.example.storage_api.model.request.StorageUnitRequest;
import com.example.storage_api.service.StorageUnitService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * API cho StorageUnit (ô kho). GET nhận các bộ lọc tuỳ chọn: facilityId / unitTypeId / status.
 * Quyền: ghi chỉ FACILITY_MANAGER. Đọc: mọi user đã đăng nhập.
 */
@RestController
@RequestMapping("/api/storage-units")
@RequiredArgsConstructor
public class StorageUnitController {

    private final StorageUnitService storageUnitService;

    // GET /api/storage-units?facilityId=1&unitTypeId=2&status=AVAILABLE
    // required = false: tham số này được bỏ trống (bỏ trống = không lọc theo nó).
    // status kiểu enum UnitStatus: Spring tự đổi chữ "AVAILABLE" thành enum, sai chữ thì trả 400.
    @GetMapping
    public List<StorageUnitResponse> search(@RequestParam(required = false) Long facilityId,
                                            @RequestParam(required = false) Integer unitTypeId,
                                            @RequestParam(required = false) UnitStatus status) {
        return storageUnitService.search(facilityId, unitTypeId, status);
    }

    // POST /api/storage-units -> tạo ô kho mới (mặc định AVAILABLE), trả 201.
    @PostMapping
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public ResponseEntity<StorageUnitResponse> create(@Valid @RequestBody StorageUnitRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageUnitService.create(request));
    }

    // PUT /api/storage-units/{id} -> sửa thông tin ô kho (không đổi status).
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public StorageUnitResponse update(@PathVariable Integer id, @Valid @RequestBody StorageUnitRequest request) {
        return storageUnitService.update(id, request);
    }

    // PATCH /api/storage-units/{id}/status -> chỉ đổi trạng thái, body: { "status": "OCCUPIED" }.
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public StorageUnitResponse changeStatus(@PathVariable Integer id,
                                            @Valid @RequestBody ChangeUnitStatusRequest request) {
        return storageUnitService.changeStatus(id, request);
    }
}

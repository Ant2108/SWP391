package com.example.storage_api.service;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.StorageUnitResponse;
import com.example.storage_api.model.request.ChangeUnitStatusRequest;
import com.example.storage_api.model.request.StorageUnitRequest;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Nghiệp vụ StorageUnit (ô kho).
 *
 * Luồng: HTTP -> StorageUnitController -> StorageUnitRequest -> StorageUnitService -> StorageUnitRepository
 *        -> Hibernate -> bảng storage_units; chiều về: StorageUnit entity -> StorageUnitResponse -> JSON.
 */
@Service
@RequiredArgsConstructor
public class StorageUnitService {

    private final StorageUnitRepository storageUnitRepository;
    // Dùng lại 2 Service khác để kiểm tra Facility / UnitType tồn tại.
    private final FacilityService facilityService;
    private final UnitTypeService unitTypeService;

    // Lọc tuỳ chọn theo facility / unitType / status (truyền null = không lọc).
    // "Danh sách ô kho còn trống" chính là gọi với status = AVAILABLE.
    @Transactional(readOnly = true)
    public List<StorageUnitResponse> search(Long facilityId, Integer unitTypeId, UnitStatus status) {
        return storageUnitRepository.search(facilityId, unitTypeId, status).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public StorageUnitResponse create(StorageUnitRequest request) {
        // Bước 1: kiểm tra Facility và UnitType có tồn tại (không có -> 404).
        Facility facility = facilityService.findOrThrow(request.getFacilityId());
        UnitType unitType = unitTypeService.findOrThrow(request.getUnitTypeId());
        // Bước 2: UnitType phải thuộc cùng Facility với ô kho (sai -> 400).
        assertUnitTypeBelongsToFacility(unitType, facility);

        // Bước 3: mã ô kho không được trùng trong cùng Facility (trùng -> 409).
        String unitCode = request.getUnitCode().trim();
        if (storageUnitRepository.existsByFacility_IdAndUnitCodeIgnoreCase(facility.getId(), unitCode)) {
            throw new ConflictException("Unit code '" + unitCode + "' already exists in this facility");
        }

        // Bước 4: tạo entity và gán các khoá ngoại + field.
        StorageUnit unit = new StorageUnit();
        unit.setFacility(facility);
        unit.setUnitType(unitType);
        unit.setUnitCode(unitCode);
        unit.setFloor(request.getFloor());
        unit.setLocation(request.getLocation());
        // Ô kho mới mặc định AVAILABLE (giá trị mặc định đã đặt trong entity, không cần set lại).
        // Bước 5: lưu (INSERT) và trả Response.
        return toResponse(storageUnitRepository.save(unit));
    }

    @Transactional
    public StorageUnitResponse update(Integer id, StorageUnitRequest request) {
        // Bước 1: tìm ô kho cần sửa. Bước 2: kiểm tra Facility, UnitType tồn tại và khớp nhau.
        StorageUnit unit = findOrThrow(id);
        Facility facility = facilityService.findOrThrow(request.getFacilityId());
        UnitType unitType = unitTypeService.findOrThrow(request.getUnitTypeId());
        assertUnitTypeBelongsToFacility(unitType, facility);

        // Bước 3: kiểm tra trùng mã với ô kho KHÁC (loại trừ chính nó bằng IdNot).
        String unitCode = request.getUnitCode().trim();
        if (storageUnitRepository.existsByFacility_IdAndUnitCodeIgnoreCaseAndIdNot(facility.getId(), unitCode, id)) {
            throw new ConflictException("Unit code '" + unitCode + "' already exists in this facility");
        }

        // Bước 4: ghi đè và lưu (UPDATE). Không đụng tới status: muốn đổi status dùng changeStatus bên dưới.
        unit.setFacility(facility);
        unit.setUnitType(unitType);
        unit.setUnitCode(unitCode);
        unit.setFloor(request.getFloor());
        unit.setLocation(request.getLocation());
        return toResponse(storageUnitRepository.save(unit));
    }

    /**
     * Đổi trạng thái ô kho. Requirement chưa định nghĩa "trạng thái nào được chuyển sang trạng thái nào"
     * nên không chặn trường hợp nào.
     */
    @Transactional
    public StorageUnitResponse changeStatus(Integer id, ChangeUnitStatusRequest request) {
        StorageUnit unit = findOrThrow(id);
        unit.setStatus(request.getStatus());
        return toResponse(storageUnitRepository.save(unit));
    }

    // Tìm ô kho theo id, không có thì ném 404.
    private StorageUnit findOrThrow(Integer id) {
        return storageUnitRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Storage unit not found: " + id));
    }

    // UnitType phải thuộc cùng Facility với StorageUnit.
    private void assertUnitTypeBelongsToFacility(UnitType unitType, Facility facility) {
        if (!unitType.getFacility().getId().equals(facility.getId())) {
            throw new BadRequestException("Unit type " + unitType.getId()
                    + " does not belong to facility " + facility.getId());
        }
    }

    // Entity -> Response. Lấy thêm tên UnitType để client hiển thị luôn.
    private StorageUnitResponse toResponse(StorageUnit u) {
        return StorageUnitResponse.builder()
                .id(u.getId())
                .facilityId(u.getFacility().getId())
                .unitTypeId(u.getUnitType().getId())
                .unitTypeName(u.getUnitType().getTypeName())
                .storageCategory(u.getUnitType().getStorageCategory())
                .unitCode(u.getUnitCode())
                .floor(u.getFloor())
                .location(u.getLocation())
                .status(u.getStatus())
                .createdAt(u.getCreatedAt())
                .updatedAt(u.getUpdatedAt())
                .build();
    }
}

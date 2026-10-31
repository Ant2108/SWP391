package com.example.storage_api.service;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.UnitTypeResponse;
import com.example.storage_api.model.request.UnitTypeRequest;
import com.example.storage_api.reponsitory.UnitTypeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Nghiệp vụ UnitType (loại kho).
 *
 * Luồng: HTTP -> UnitTypeController -> UnitTypeRequest -> UnitTypeService -> UnitTypeRepository
 *        -> Hibernate -> bảng unit_types; chiều về: UnitType entity -> UnitTypeResponse -> JSON.
 */
@Service
@RequiredArgsConstructor
public class UnitTypeService {

    // Spring tự truyền vào qua constructor (do @RequiredArgsConstructor + final).
    private final UnitTypeRepository unitTypeRepository;
    // Gọi FacilityService để kiểm tra Facility có tồn tại, khỏi viết lại logic tìm Facility.
    private final FacilityService facilityService;
    private final FacilityAuthorizationService facilityAuthorizationService;

    @Transactional(readOnly = true)
    public List<UnitTypeResponse> getByFacility(Long facilityId) {
        // Bước 1: kiểm tra Facility tồn tại. Không có -> 404, thay vì trả list rỗng gây hiểu nhầm.
        facilityService.findOrThrow(facilityId);
        // Bước 2: lấy các UnitType của Facility đó (đã sắp theo tên), Bước 3: đổi sang Response.
        return unitTypeRepository.findByFacility_IdOrderByTypeNameAsc(facilityId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public UnitTypeResponse create(UnitTypeRequest request) {
        // Bước 1: UnitType.FacilityId phải tồn tại (không có -> 404).
        Facility facility = facilityService.findOrThrow(request.getFacilityId());
        // Facility Manager chỉ được tạo loại kho cho cơ sở được phân công.
        facilityAuthorizationService.assertCanAccessFacility(facility.getId());
        // Bước 2: làm sạch tên (bỏ dấu cách thừa) trước khi so sánh trùng.
        String typeName = request.getTypeName().trim();

        // Bước 3: không được trùng (Facility + TypeName). Trùng -> 409.
        if (unitTypeRepository.existsByFacility_IdAndTypeNameIgnoreCase(facility.getId(), typeName)) {
            throw new ConflictException("Unit type '" + typeName + "' already exists in this facility");
        }

        // Bước 4: tạo entity, gán Facility (khoá ngoại), chép các field còn lại.
        UnitType unitType = new UnitType();
        unitType.setFacility(facility);
        apply(unitType, request, typeName);
        // Bước 5: lưu (INSERT) và trả Response.
        return toResponse(unitTypeRepository.save(unitType));
    }

    @Transactional
    public UnitTypeResponse update(Integer id, UnitTypeRequest request) {
        // Bước 1: tìm UnitType cần sửa (không có -> 404).
        UnitType unitType = findOrThrow(id);

        // Phải có quyền với cơ sở hiện tại của bản ghi, và với cơ sở mới nếu request đổi facilityId.
        facilityAuthorizationService.assertCanAccessFacility(unitType.getFacility().getId());
        if (request.getFacilityId() != null && !request.getFacilityId().equals(unitType.getFacility().getId())) {
            facilityAuthorizationService.assertCanAccessFacility(request.getFacilityId());
        }

        // Bước 2: không cho chuyển UnitType sang Facility khác, vì StorageUnit / PriceRule đang dùng nó
        // phải luôn cùng Facility với nó.
        if (!unitType.getFacility().getId().equals(request.getFacilityId())) {
            throw new BadRequestException("Facility of an existing unit type cannot be changed");
        }

        // Bước 3: kiểm tra trùng tên với UnitType KHÁC trong cùng Facility (loại trừ chính nó bằng IdNot).
        String typeName = request.getTypeName().trim();
        if (unitTypeRepository.existsByFacility_IdAndTypeNameIgnoreCaseAndIdNot(
                request.getFacilityId(), typeName, id)) {
            throw new ConflictException("Unit type '" + typeName + "' already exists in this facility");
        }

        // Bước 4: ghi đè field và lưu (UPDATE).
        apply(unitType, request, typeName);
        return toResponse(unitTypeRepository.save(unitType));
    }

    /**
     * Disable mềm: IsActive = false.
     * Không hard-delete vì StorageUnit và PriceRule có thể đang tham chiếu tới UnitType này.
     */
    @Transactional
    public UnitTypeResponse disable(Integer id) {
        UnitType unitType = findOrThrow(id);
        facilityAuthorizationService.assertCanAccessFacility(unitType.getFacility().getId());
        unitType.setActive(false);
        return toResponse(unitTypeRepository.save(unitType));
    }

    // Dùng chung cho StorageUnitService / PriceRuleService (cùng package nên không cần "public").
    UnitType findOrThrow(Integer id) {
        return unitTypeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Unit type not found: " + id));
    }

    // Chép các field từ Request sang Entity (không gồm Facility vì create/update xử lý khác nhau).
    private void apply(UnitType unitType, UnitTypeRequest request, String typeName) {
        unitType.setTypeName(typeName);
        unitType.setWidth(request.getWidth());
        unitType.setLength(request.getLength());
        unitType.setHeight(request.getHeight());
        unitType.setSizeDescription(request.getSizeDescription());
        unitType.setDescription(request.getDescription());
        unitType.setImageUrl(request.getImageUrl());
    }

    // Entity -> Response. Chỉ lấy facility.getId() để không kéo cả object Facility vào JSON.
    private UnitTypeResponse toResponse(UnitType t) {
        return UnitTypeResponse.builder()
                .id(t.getId())
                .facilityId(t.getFacility().getId())
                .typeName(t.getTypeName())
                .width(t.getWidth())
                .length(t.getLength())
                .height(t.getHeight())
                .sizeDescription(t.getSizeDescription())
                .description(t.getDescription())
                .imageUrl(t.getImageUrl())
                .active(t.isActive())
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .build();
    }
}

package com.example.storage_api.service;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.FacilityStatus;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.FacilityResponse;
import com.example.storage_api.model.request.FacilityRequest;
import com.example.storage_api.reponsitory.FacilityRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service = nơi chứa "nghiệp vụ" (luật của hệ thống). Controller chỉ nhận/gửi dữ liệu, còn Service mới
 * quyết định làm gì: kiểm tra hợp lệ, tìm entity, đổi Request -> Entity, lưu, đổi Entity -> Response.
 *
 * Luồng ghi:  HTTP -> FacilityController -> FacilityRequest -> FacilityService -> FacilityRepository
 *             -> Hibernate -> bảng facilities.
 * Luồng đọc:  bảng facilities -> Facility entity -> FacilityResponse -> JSON.
 */
@Service // Báo Spring tạo sẵn một object của class này để các class khác dùng
@RequiredArgsConstructor // Lombok tạo constructor nhận các field "final" => Spring tự "tiêm" (inject) Repository vào
public class FacilityService {

    // final + @RequiredArgsConstructor = Spring tự truyền FacilityRepository vào khi tạo Service.
    private final FacilityRepository facilityRepository;

    // readOnly = true: transaction chỉ đọc (nhanh hơn, và báo rõ method này không sửa dữ liệu).
    @Transactional(readOnly = true)
    public List<FacilityResponse> getFacilities() {
        // Bước 1: lấy mọi Facility từ DB, sắp xếp theo id tăng dần.
        // Bước 2: với từng Facility, đổi sang FacilityResponse (this::toResponse).
        // Bước 3: gom thành List trả về.
        return facilityRepository.findAll(Sort.by("id")).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public FacilityResponse getFacility(Long id) {
        // Tìm theo id (nếu không có thì ném 404) rồi đổi sang Response.
        return toResponse(findOrThrow(id));
    }

    // @Transactional: toàn bộ method chạy trong MỘT transaction. Lỗi giữa chừng thì DB tự hoàn tác, không ghi dở.
    @Transactional
    public FacilityResponse create(FacilityRequest request) {
        // Bước 1: tạo object Facility mới (status tự là ACTIVE vì entity đã đặt mặc định).
        Facility facility = new Facility();
        // Bước 2: chép dữ liệu từ request sang entity.
        apply(facility, request);
        // Bước 3: save => Hibernate sinh câu INSERT gửi xuống SQL Server, rồi trả về entity đã có id.
        // Bước 4: đổi entity sang Response để trả JSON.
        return toResponse(facilityRepository.save(facility));
    }

    @Transactional
    public FacilityResponse update(Long id, FacilityRequest request) {
        // Bước 1: tìm Facility cần sửa (không có -> 404).
        Facility facility = findOrThrow(id);
        // Bước 2: ghi đè các field bằng dữ liệu mới.
        apply(facility, request);
        // Bước 3: save => Hibernate sinh câu UPDATE (vì entity đã có id).
        return toResponse(facilityRepository.save(facility));
    }

    /**
     * Disable mềm: chỉ đặt Status = INACTIVE, KHÔNG xoá row.
     * Không tự disable UnitType / StorageUnit đi kèm vì requirement không định nghĩa hành vi đó.
     */
    @Transactional
    public FacilityResponse disable(Long id) {
        // Bước 1: tìm Facility (không có -> 404).
        Facility facility = findOrThrow(id);
        // Bước 2: đổi trạng thái.
        facility.setStatus(FacilityStatus.INACTIVE);
        // Bước 3: lưu (UPDATE) và trả kết quả.
        return toResponse(facilityRepository.save(facility));
    }

    // Không có "public" = chỉ các Service cùng package dùng được (UnitTypeService, StorageUnitService...
    // gọi hàm này để kiểm tra Facility tồn tại, khỏi viết lại).
    Facility findOrThrow(Long id) {
        // findById trả Optional; orElseThrow: rỗng thì ném ResourceNotFoundException -> HTTP 404.
        return facilityRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Facility not found: " + id));
    }

    // Chép dữ liệu Request -> Entity (dùng chung cho create và update).
    private void apply(Facility facility, FacilityRequest request) {
        // trim(): bỏ dấu cách thừa ở đầu/cuối. (name, address đã được @NotBlank đảm bảo không null.)
        facility.setName(request.getName().trim());
        facility.setAddress(request.getAddress().trim());
        facility.setPhone(request.getPhone());
        facility.setOpeningTime(request.getOpeningTime());
        facility.setClosingTime(request.getClosingTime());
        // Không gửi thì giữ nguyên giá trị hiện có (mặc định của entity khi tạo mới).
        if (request.getStorageTypes() != null) {
            facility.setStorageTypes(java.util.EnumSet.copyOf(request.getStorageTypes()));
        }
        if (request.getStockStatus() != null) {
            facility.setStockStatus(request.getStockStatus());
        }
    }

    // Chép dữ liệu Entity -> Response (chỉ những field muốn trả cho client).
    private FacilityResponse toResponse(Facility f) {
        return FacilityResponse.builder()
                .id(f.getId())
                .name(f.getName())
                .address(f.getAddress())
                .phone(f.getPhone())
                .openingTime(f.getOpeningTime())
                .closingTime(f.getClosingTime())
                .status(f.getStatus())
                .storageTypes(f.getStorageTypes())
                .stockStatus(f.getStockStatus())
                .createdAt(f.getCreatedAt())
                .updatedAt(f.getUpdatedAt())
                .build();
    }
}

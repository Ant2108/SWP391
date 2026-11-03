package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.UnitType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository của bảng unit_types. Mọi method dưới đây Spring tự sinh SQL từ TÊN method.
 *
 * Cách đọc tên: "Facility_Id" nghĩa là đi qua field "facility" của UnitType rồi lấy "id" của nó
 * (tức cột FacilityId). "IgnoreCase" = không phân biệt hoa thường.
 */
@Repository
public interface UnitTypeRepository extends JpaRepository<UnitType, Integer> {

    // Lấy mọi loại kho của một Facility, sắp xếp theo tên A -> Z.
    // SQL tương đương: SELECT ... FROM unit_types WHERE facility_id = ? ORDER BY type_name ASC
    List<UnitType> findByFacility_IdOrderByTypeNameAsc(Long facilityId);

    // Tìm đúng một UnitType theo (Facility + TypeName). Dùng bởi DataSeeder để không tạo trùng.
    Optional<UnitType> findFirstByFacility_IdAndTypeNameIgnoreCase(Long facilityId, String typeName);

    // Kiểm tra đã có UnitType cùng tên trong Facility này chưa (true/false).
    // IgnoreCase vì SQL Server mặc định không phân biệt hoa thường, "Small" và "small" bị coi là trùng.
    boolean existsByFacility_IdAndTypeNameIgnoreCase(Long facilityId, String typeName);

    // Giống trên nhưng LOẠI TRỪ chính nó (IdNot): dùng khi UPDATE, để không tự báo trùng với chính mình.
    boolean existsByFacility_IdAndTypeNameIgnoreCaseAndIdNot(Long facilityId, String typeName, Integer id);
}

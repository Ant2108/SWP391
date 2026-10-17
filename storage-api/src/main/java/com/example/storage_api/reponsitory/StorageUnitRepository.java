package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/** Repository của bảng storage_units. */
@Repository
public interface StorageUnitRepository extends JpaRepository<StorageUnit, Integer> {

    // Câu truy vấn viết bằng JPQL (giống SQL nhưng gọi theo tên class/field Java, không phải tên bảng/cột).
    //
    // Ý nghĩa từng dòng:
    //  - "join fetch s.facility / s.unitType": nạp luôn Facility và UnitType cùng lúc, tránh bị N+1 câu SELECT
    //    khi Service đọc s.getFacility() / s.getUnitType() để tạo response.
    //  - "(:facilityId is null or f.id = :facilityId)": nếu client KHÔNG truyền facilityId (null) thì bỏ qua
    //    điều kiện này; nếu có truyền thì lọc đúng Facility đó. Ba điều kiện dưới đều theo mẫu này,
    //    nên client có thể kết hợp lọc tuỳ ý: chỉ facility, chỉ status, hoặc cả ba.
    //  - "order by": sắp xếp theo Facility rồi theo mã ô kho.
    @Query("""
            select s from StorageUnit s
            join fetch s.facility f
            join fetch s.unitType t
            where (:facilityId is null or f.id = :facilityId)
              and (:unitTypeId is null or t.id = :unitTypeId)
              and (:status is null or s.status = :status)
            order by f.id, s.unitCode
            """)
    List<StorageUnit> search(@Param("facilityId") Long facilityId,
                             @Param("unitTypeId") Integer unitTypeId,
                             @Param("status") UnitStatus status);

    // Đã có ô kho cùng mã trong Facility này chưa? (dùng khi tạo mới, và bởi DataSeeder)
    boolean existsByFacility_IdAndUnitCodeIgnoreCase(Long facilityId, String unitCode);

    // Giống trên nhưng loại trừ chính nó, dùng khi UPDATE.
    boolean existsByFacility_IdAndUnitCodeIgnoreCaseAndIdNot(Long facilityId, String unitCode, Integer id);
}

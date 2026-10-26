package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

/**
 * Repository của bảng price_rules.
 *
 * Quy ước quan trọng - "scope khớp CHÍNH XÁC":
 *  - Tham số null chỉ khớp với cột NULL (rule toàn hệ thống / rule không phụ thuộc loại kho).
 *  - KHÔNG tự động lấy rule của phạm vi rộng hơn (fallback), vì requirement chưa quy định thứ tự ưu tiên.
 *
 * Mẫu điều kiện lặp lại bên dưới:
 *   ((:facilityId is null and r.facility is null) or r.facility.id = :facilityId)
 *   = "nếu không truyền facilityId thì chỉ lấy rule có facility NULL; nếu có truyền thì lấy rule đúng Facility đó".
 */
@Repository
public interface PriceRuleRepository extends JpaRepository<PriceRule, Integer> {

    // Tìm rule ĐANG CÓ HIỆU LỰC tại ngày `today` cho đúng scope. Một rule được coi là hiệu lực khi:
    //  - đúng PriceType, đúng scope,
    //  - active = true (chưa bị disable),
    //  - effectiveFrom <= today (đã bắt đầu),
    //  - effectiveTo là NULL (chưa kết thúc) hoặc effectiveTo >= today (chưa hết hạn).
    // Trả về List để Service tự quyết định: rỗng -> 404, đúng 1 -> OK, hơn 1 -> 409.
    @Query("""
            select r from PriceRule r
            where r.priceType = :priceType
              and ((:facilityId is null and r.facility is null) or r.facility.id = :facilityId)
              and ((:unitTypeId is null and r.unitType is null) or r.unitType.id = :unitTypeId)
              and r.active = true
              and r.effectiveFrom <= :today
              and (r.effectiveTo is null or r.effectiveTo >= :today)
            """)
    List<PriceRule> findEffective(@Param("priceType") PriceType priceType,
                                  @Param("facilityId") Long facilityId,
                                  @Param("unitTypeId") Integer unitTypeId,
                                  @Param("today") LocalDate today);

    // Lịch sử giá của đúng scope: KHÔNG lọc theo ngày hay active nên có cả rule đã hết hạn / đã disable.
    // Sắp xếp rule bắt đầu gần nhất lên đầu (desc), cùng ngày thì id lớn hơn trước.
    @Query("""
            select r from PriceRule r
            where r.priceType = :priceType
              and ((:facilityId is null and r.facility is null) or r.facility.id = :facilityId)
              and ((:unitTypeId is null and r.unitType is null) or r.unitType.id = :unitTypeId)
            order by r.effectiveFrom desc, r.id desc
            """)
    List<PriceRule> findHistory(@Param("priceType") PriceType priceType,
                                @Param("facilityId") Long facilityId,
                                @Param("unitTypeId") Integer unitTypeId);

    // Dùng cho DataSeeder: đã có rule "cùng loại" chưa? Cùng scope + PriceType + CalculationType + IsActive,
    // và cùng trạng thái mở/đóng (openEnded = EffectiveTo null). Không so ngày vì seed dùng LocalDate.now()
    // nên ngày đổi mỗi lần chạy; không so số tiền để rule đã sửa tay qua API không bị seed lại thành bản trùng.
    // "select count(r) > 0" trả về true/false.
    @Query("""
            select count(r) > 0 from PriceRule r
            where r.priceType = :priceType
              and r.calculationType = :calculationType
              and ((:facilityId is null and r.facility is null) or r.facility.id = :facilityId)
              and ((:unitTypeId is null and r.unitType is null) or r.unitType.id = :unitTypeId)
              and r.active = :active
              and ((:openEnded = true and r.effectiveTo is null) or (:openEnded = false and r.effectiveTo is not null))
            """)
    boolean existsSeedMatch(@Param("priceType") PriceType priceType,
                            @Param("calculationType") CalculationType calculationType,
                            @Param("facilityId") Long facilityId,
                            @Param("unitTypeId") Integer unitTypeId,
                            @Param("active") boolean active,
                            @Param("openEnded") boolean openEnded);

    // Danh sách cho màn hình quản lý (GET /api/price-rules): mỗi bộ lọc là TUỲ CHỌN, null = không lọc.
    // Khác với findEffective/findHistory: ở đây facilityId null nghĩa là "không lọc theo Facility".
    @Query("""
            select r from PriceRule r
            where (:priceType is null or r.priceType = :priceType)
              and (:facilityId is null or r.facility.id = :facilityId)
              and (:unitTypeId is null or r.unitType.id = :unitTypeId)
            order by r.effectiveFrom desc, r.id desc
            """)
    List<PriceRule> search(@Param("priceType") PriceType priceType,
                           @Param("facilityId") Long facilityId,
                           @Param("unitTypeId") Integer unitTypeId);
}

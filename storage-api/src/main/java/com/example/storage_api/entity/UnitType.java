package com.example.storage_api.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.Nationalized;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Entity UnitType = một dòng trong bảng unit_types (một "loại kho", vd SMALL / MEDIUM / LARGE).
 *
 * Mỗi UnitType thuộc đúng MỘT Facility. Tên loại (TypeName) chỉ cần không trùng trong cùng một Facility:
 * Facility A có "SMALL" và Facility B cũng có "SMALL" là hợp lệ.
 */
@Entity
@Table(
        name = "UnitTypes",
        // Ràng buộc UNIQUE trên cặp (FacilityId, TypeName): DB từ chối nếu trùng cả hai.
        // Đây là "lưới an toàn" cuối cùng, ngoài bước kiểm tra trùng trong Service.
        uniqueConstraints = @UniqueConstraint(
                name = "UQ_UnitTypes_Facility_TypeName",
                columnNames = {"FacilityId", "TypeName"}
        )
)
@Getter
@Setter
@NoArgsConstructor
public class UnitType extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UnitTypeId")
    private Integer id;

    // @ManyToOne: nhiều UnitType thuộc về một Facility. Đây là khoá ngoại (FK) FacilityId.
    // LAZY: chỉ nạp Facility từ DB khi thật sự dùng tới (tiết kiệm câu SELECT).
    // optional = false: UnitType bắt buộc phải có Facility.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    @Nationalized
    @Column(name = "TypeName", nullable = false, length = 100)
    private String typeName;

    // BigDecimal: kiểu số thập phân chính xác (không bị sai số như double). precision 10, scale 2 = decimal(10,2).
    @Column(name = "Width", precision = 10, scale = 2)
    private BigDecimal width;

    @Column(name = "Length", precision = 10, scale = 2)
    private BigDecimal length;

    @Column(name = "Height", precision = 10, scale = 2)
    private BigDecimal height;

    @Nationalized
    @Column(name = "SizeDescription", length = 150)
    private String sizeDescription;

    @Nationalized
    @Column(name = "Description", length = 500)
    private String description;

    // Đường dẫn (URL) tới ảnh của loại kho. Có thể để trống: client sẽ hiển thị ảnh minh họa mặc định.
    @Column(name = "ImageUrl", length = 500)
    private String imageUrl;

    // false = đã disable. Không xoá row vì StorageUnit / PriceRule khác có thể đang tham chiếu tới nó.
    @Column(name = "IsActive", nullable = false)
    private boolean active = true;
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.Nationalized;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Entity StorageUnit = một dòng trong bảng storage_units (một ô kho cụ thể, vd A01, B02).
 *
 * Một StorageUnit thuộc một Facility và có một UnitType.
 * Quy tắc nghiệp vụ: UnitType phải thuộc CÙNG Facility với StorageUnit (Service kiểm tra).
 * UnitCode (mã ô kho) chỉ cần không trùng trong cùng một Facility.
 */
@Entity
@Table(
        name = "StorageUnits",
        // UNIQUE (FacilityId, UnitCode): cùng Facility thì không được có hai ô kho trùng mã.
        uniqueConstraints = @UniqueConstraint(
                name = "UQ_StorageUnits_Facility_UnitCode",
                columnNames = {"FacilityId", "UnitCode"}
        )
)
@Getter
@Setter
@NoArgsConstructor
public class StorageUnit extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "StorageUnitId")
    private Integer id;

    // Khoá ngoại tới Facility. StorageUnit lưu FacilityId riêng (đúng theo schema),
    // nên Service phải đảm bảo nó khớp với UnitType.facility.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    // Khoá ngoại tới UnitType (loại kho của ô này).
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "UnitTypeId", nullable = false)
    private UnitType unitType;

    @Nationalized
    @Column(name = "UnitCode", nullable = false, length = 50)
    private String unitCode;

    @Nationalized
    @Column(name = "Floor", length = 50)
    private String floor;

    @Nationalized
    @Column(name = "Location", length = 150)
    private String location;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private UnitStatus status = UnitStatus.AVAILABLE; // ô kho mới mặc định là AVAILABLE (còn trống)
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Biên bản trả kho: tình trạng kho khi khách trả, có hư hại hay không và phí đền bù. */
@Entity
@Table(name = "UnitReturns")
@Getter
@Setter
@NoArgsConstructor
public class UnitReturn extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UnitReturnId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "RentalContractId", nullable = false)
    private RentalContract rentalContract;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    // Staff đã kiểm tra kho.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "StaffId", nullable = false)
    private Users staff;

    @Column(name = "ReturnedAt", nullable = false)
    private LocalDateTime returnedAt;

    @Nationalized
    @Column(name = "UnitCondition", length = 500)
    private String unitCondition;

    @Column(name = "HasDamage", nullable = false)
    private boolean hasDamage;

    @Nationalized
    @Column(name = "DamageDescription", length = 500)
    private String damageDescription;

    // Các loại hư hại staff đã tích (mã DamageType, cách nhau bởi dấu phẩy).
    @Column(name = "DamageItems", length = 300)
    private String damageItems;

    // Phí hư hại do manager / staff cơ sở chốt SAU khi sửa xong, không phải lúc kiểm tra.
    @Column(name = "DamageFee", precision = 18, scale = 2)
    private BigDecimal damageFee;

    // Phí từng hạng mục, dạng "DOOR=50,LOCK=20,OTHER=10"; DamageFee là tổng.
    @org.hibernate.annotations.Nationalized
    @Column(name = "DamageFeeBreakdown", length = 500)
    private String damageFeeBreakdown;

    @Enumerated(EnumType.STRING)
    @Column(name = "DamageStatus", length = 20)
    private DamageStatus damageStatus;

    @Column(name = "DamageFeeIssuedAt")
    private LocalDateTime damageFeeIssuedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "DamageFeeIssuedById")
    private Users damageFeeIssuedBy;

    @Nationalized
    @Column(name = "Notes", length = 500)
    private String notes;
}

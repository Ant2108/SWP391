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

    @Column(name = "DamageFee", precision = 18, scale = 2)
    private BigDecimal damageFee;

    @Nationalized
    @Column(name = "Notes", length = 500)
    private String notes;
}

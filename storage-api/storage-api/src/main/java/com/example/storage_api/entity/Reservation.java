package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity đơn đặt chỗ thuê kho (Reservations) — Phụ trách bởi Thành viên 3.
 * Lưu thông tin khách hàng, cơ sở, loại kho, ô kho thực tế được gán, ngày bắt đầu và số tháng thuê.
 */
@Entity
@Table(name = "Reservations")
@Getter
@Setter
@NoArgsConstructor
public class Reservation extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ReservationId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "UnitTypeId", nullable = false)
    private UnitType unitType;

    // Ô kho vật lý được Manager gán (null khi khách mới tạo đặt chỗ).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "StorageUnitId")
    private StorageUnit storageUnit;

    @Column(name = "StartDate", nullable = false)
    private LocalDate startDate;

    @Column(name = "RentalMonths", nullable = false)
    private Integer rentalMonths;

    @Column(name = "EstimatedAmount", precision = 18, scale = 2)
    private BigDecimal estimatedAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private ReservationStatus status = ReservationStatus.PENDING;
}

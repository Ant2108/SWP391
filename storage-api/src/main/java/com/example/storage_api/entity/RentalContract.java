package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Entity hợp đồng thuê kho (RentalContracts) — Phụ trách bởi Thành viên 3.
 * Lưu ô kho thực tế, thời hạn thuê, snapshot giá và thông tin chữ ký điện tử của khách hàng.
 */
@Entity
@Table(name = "RentalContracts")
@Getter
@Setter
@NoArgsConstructor
public class RentalContract extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "RentalContractId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ReservationId", nullable = false)
    private Reservation reservation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "StorageUnitId", nullable = false)
    private StorageUnit storageUnit;

    @Column(name = "StartDate", nullable = false)
    private LocalDate startDate;

    @Column(name = "EndDate", nullable = false)
    private LocalDate endDate;

    // Snapshot giá thuê hàng tháng và tiền cọc tại thời điểm tạo hợp đồng.
    @Column(name = "MonthlyPrice", precision = 18, scale = 2)
    private BigDecimal monthlyPrice;

    @Column(name = "DepositAmount", precision = 18, scale = 2)
    private BigDecimal depositAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private ContractStatus status = ContractStatus.PENDING;

    @Column(name = "SignedAt")
    private LocalDateTime signedAt;

    @Nationalized
    @Column(name = "SignerName", length = 150)
    private String signerName;

    @Column(name = "SignatureUrl", length = 100000)
    private String signatureUrl;
}

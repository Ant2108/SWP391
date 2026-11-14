package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Yêu cầu hủy hợp đồng sớm của khách (sau khi đã nhận kho). Bảng riêng nên không đụng trạng thái của hợp đồng
 * cho tới khi quản lý xác nhận hủy. Các cột kết quả (tiền) chỉ được ghi khi quản lý xác nhận.
 */
@Entity
@Table(name = "ContractTerminations")
@Getter
@Setter
@NoArgsConstructor
public class ContractTermination extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "TerminationId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "RentalContractId", nullable = false)
    private RentalContract rentalContract;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private TerminationStatus status = TerminationStatus.REQUESTED;

    @Column(name = "RequestedAt", nullable = false)
    private LocalDateTime requestedAt;

    /** Thời điểm khách tích đồng ý điều khoản hủy sớm. */
    @Column(name = "AgreedAt", nullable = false)
    private LocalDateTime agreedAt;

    @org.hibernate.annotations.Nationalized
    @Column(name = "Reason", length = 500)
    private String reason;

    /** Chính sách tại thời điểm yêu cầu (lưu lại để không bị đổi khi chính sách thay đổi). */
    @Column(name = "NoticeDays", nullable = false)
    private Integer noticeDays;

    @Column(name = "ForfeitPercent", nullable = false)
    private Integer forfeitPercent;

    @org.hibernate.annotations.Nationalized
    @Column(name = "RejectReason", length = 500)
    private String rejectReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "DecidedById")
    private Users decidedBy;

    @Column(name = "DecidedAt")
    private LocalDateTime decidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "UnitReturnId")
    private UnitReturn unitReturn;

    @Column(name = "InspectedAt")
    private LocalDateTime inspectedAt;

    // ---- Kết quả khi quản lý xác nhận hủy ----
    @Column(name = "UsedMonths")
    private Integer usedMonths;

    @Column(name = "RentUsedAmount", precision = 18, scale = 2)
    private BigDecimal rentUsedAmount;

    @Column(name = "DepositForfeited", precision = 18, scale = 2)
    private BigDecimal depositForfeited;

    @Column(name = "DamageFeeApplied", precision = 18, scale = 2)
    private BigDecimal damageFeeApplied;

    /** Số tiền công ty phải hoàn cho khách (0 nếu không có). */
    @Column(name = "RefundAmount", precision = 18, scale = 2)
    private BigDecimal refundAmount;

    /** Số tiền khách còn phải trả thêm (0 nếu không có). */
    @Column(name = "ExtraBilled", precision = 18, scale = 2)
    private BigDecimal extraBilled;

    /** Khoản cọc (Payment DEPOSIT) dùng để theo dõi chuyển khoản hoàn cho khách. */
    @Column(name = "RefundPaymentId")
    private Integer refundPaymentId;

    @Column(name = "CompletedAt")
    private LocalDateTime completedAt;
}

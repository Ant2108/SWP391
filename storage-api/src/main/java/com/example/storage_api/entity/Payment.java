package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entity giao dịch thanh toán (Payments) — Phụ trách bởi Thành viên 3.
 * Hỗ trợ DEPOSIT, RENTAL, RENEWAL, OVERDUE_FEE, EXTRA_FEE và DAMAGE_FEE.
 */
@Entity
@Table(name = "Payments")
@Getter
@Setter
@NoArgsConstructor
public class Payment extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PaymentId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ReservationId")
    private Reservation reservation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "RentalContractId")
    private RentalContract rentalContract;

    @Enumerated(EnumType.STRING)
    @Column(name = "PaymentType", nullable = false, length = 20)
    private PaymentType paymentType;

    @Column(name = "Amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "PaymentMethod", length = 50)
    private String paymentMethod;

    @Column(name = "TransactionReference", length = 150)
    private String transactionReference;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private PaymentStatus status = PaymentStatus.PENDING;

    @Column(name = "PaidAt")
    private LocalDateTime paidAt;

    // ---- Thông tin hoàn cọc (chỉ dùng cho khoản DEPOSIT khi hoàn/khấu trừ) ----
    @Column(name = "RefundAmount", precision = 18, scale = 2)
    private BigDecimal refundAmount;

    @Column(name = "DeductionAmount", precision = 18, scale = 2)
    private BigDecimal deductionAmount;

    // Các dòng khấu trừ, mỗi dòng "Nội dung|Số tiền", cách nhau bằng ";" (hiển thị trên hóa đơn).
    @org.hibernate.annotations.Nationalized
    @Column(name = "DeductionLines", length = 1000)
    private String deductionLines;

    // Thời điểm công ty đã chuyển khoản hoàn (null = chưa chuyển) và mã giao dịch hoàn.
    @Column(name = "RefundedAt")
    private LocalDateTime refundedAt;

    @Column(name = "RefundTransferRef", length = 150)
    private String refundTransferRef;

    // Khoản phí được miễn (vẫn lưu trạng thái FAILED để không phải thêm giá trị enum; có WaivedAt nghĩa là "Đã miễn").
    @Column(name = "WaivedAt")
    private LocalDateTime waivedAt;

    @org.hibernate.annotations.Nationalized
    @Column(name = "WaivedBy", length = 150)
    private String waivedBy;

    @org.hibernate.annotations.Nationalized
    @Column(name = "WaivedReason", length = 500)
    private String waivedReason;
}

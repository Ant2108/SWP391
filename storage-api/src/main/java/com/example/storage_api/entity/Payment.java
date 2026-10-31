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
}

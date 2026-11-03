package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity PriceRule = một dòng trong bảng price_rules (một quy tắc giá).
 *
 * "Scope" (phạm vi áp dụng) của rule do cặp (facility, unitType) quyết định:
 *  - facility = null             => rule áp dụng toàn hệ thống.
 *  - unitType = null             => rule không phụ thuộc loại kho.
 *  - có cả hai                   => rule riêng cho một loại kho của một cơ sở.
 *
 * Rule có thời hạn: từ effectiveFrom đến effectiveTo (effectiveTo = null nghĩa là chưa có ngày kết thúc).
 * Giá cũ không bị xoá mà giữ lại làm "lịch sử giá".
 */
@Entity
@Table(name = "PriceRules")
@Getter
@Setter
@NoArgsConstructor
public class PriceRule extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PriceRuleId")
    private Integer id;

    // Không có "optional = false" và nullable mặc định => cột này được phép NULL (rule toàn hệ thống).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "FacilityId")
    private Facility facility;

    // Được phép NULL (rule không phụ thuộc loại kho).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "UnitTypeId")
    private UnitType unitType;

    // Giá gì: RENTAL, DEPOSIT, ...
    @Enumerated(EnumType.STRING)
    @Column(name = "PriceType", nullable = false, length = 20)
    private PriceType priceType;

    // Tính thế nào: FIXED, PER_DAY, PER_MONTH, PERCENTAGE.
    @Enumerated(EnumType.STRING)
    @Column(name = "CalculationType", nullable = false, length = 20)
    private CalculationType calculationType;

    // Số tiền, dùng khi CalculationType KHÔNG phải PERCENTAGE. decimal(18,2).
    @Column(name = "Amount", precision = 18, scale = 2)
    private BigDecimal amount;

    // Số phần trăm, dùng khi CalculationType = PERCENTAGE. decimal(8,2).
    @Column(name = "Percentage", precision = 8, scale = 2)
    private BigDecimal percentage;

    // Ngày bắt đầu có hiệu lực. LocalDate = chỉ có ngày (không có giờ).
    @Column(name = "EffectiveFrom", nullable = false)
    private LocalDate effectiveFrom;

    // Ngày kết thúc hiệu lực. NULL = chưa kết thúc.
    @Column(name = "EffectiveTo")
    private LocalDate effectiveTo;

    // false = rule đã bị disable (không được dùng làm giá hiện tại nhưng vẫn giữ lại làm lịch sử).
    @Column(name = "IsActive", nullable = false)
    private boolean active = true;

    // Khoá ngoại tới bảng Users (ai tạo rule). Users thuộc module khác nên ta chỉ tham chiếu, không tạo lại.
    // Được phép NULL vì phần đăng nhập chưa nối vào module này.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CreatedBy")
    private Users createdBy;
}

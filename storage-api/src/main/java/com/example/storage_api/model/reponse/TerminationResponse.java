package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.TerminationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TerminationResponse {
    private Integer id;
    private Integer contractId;
    private Long customerId;
    private String customerName;
    private String customerPhone;
    private Long facilityId;
    private String facilityName;
    private String unitCode;
    private String unitTypeName;
    private LocalDate contractStart;
    private LocalDate contractEnd;
    private TerminationStatus status;
    private LocalDateTime requestedAt;
    private String reason;
    private Integer noticeDays;
    private Integer forfeitPercent;
    private LocalDate noticeEndDate;
    private String rejectReason;
    private LocalDateTime decidedAt;
    // Kiểm tra kho
    private Integer unitReturnId;
    private LocalDateTime inspectedAt;
    private boolean hasDamage;
    private String damageStatus;
    private BigDecimal damageFee;
    // Lịch kiểm tra kho đang chờ (nếu có)
    private Integer inspectionAppointmentId;
    private LocalDateTime inspectionAt;
    private String inspectionStaffName;
    // Tiền: ước tính khi đang xử lý, chốt khi đã hoàn tất
    private Integer monthsTotal;
    private Integer usedMonths;
    private BigDecimal rentPaid;
    private BigDecimal rentUsed;
    private BigDecimal deposit;
    private BigDecimal depositForfeited;
    private BigDecimal pendingFees;
    private BigDecimal refundAmount;
    private BigDecimal extraBilled;
    private LocalDateTime completedAt;
    /** Id khoản cọc dùng để theo dõi chuyển khoản hoàn (Payment DEPOSIT), null nếu không có. */
    private Integer refundPaymentId;
    private boolean refundTransferred;
}

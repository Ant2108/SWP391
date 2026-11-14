package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Luật và số tiền ước tính khi hủy hợp đồng sớm, hiển thị cho khách trước khi họ đồng ý. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TerminationQuoteResponse {
    private Integer contractId;
    private boolean canRequest;
    private String blockedReason;
    private Integer noticeDays;
    private Integer forfeitPercent;
    private Integer monthsTotal;
    private Integer usedMonths;
    /** Ngày dự kiến kết thúc (hôm nay + số ngày báo trước). */
    private LocalDate effectiveDate;
    private BigDecimal monthlyRent;
    private BigDecimal rentPaid;
    private BigDecimal rentUsed;
    private BigDecimal deposit;
    private BigDecimal depositForfeited;
    private BigDecimal pendingFees;
    /** Số tiền dự kiến hoàn lại (chưa gồm phí hư hại, nếu có sẽ chốt sau khi kiểm tra kho). */
    private BigDecimal estimatedRefund;
    /** Số tiền dự kiến khách còn phải trả thêm (nếu chưa đóng đủ tiền thuê tháng đã dùng). */
    private BigDecimal estimatedExtra;
}

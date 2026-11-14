package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** Hóa đơn / biên nhận của một khoản thu để khách xem (minh bạch từng dòng, khấu trừ và hoàn cọc). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InvoiceResponse {
    private Integer paymentId;
    private String invoiceNumber;
    private String title;            // ví dụ "Hóa đơn tiền đặt cọc Đợt 1"
    private String paymentType;
    private String status;
    private LocalDateTime issuedAt;
    private LocalDateTime paidAt;
    private String paymentMethod;
    private String transactionReference;
    private String customerName;
    private String customerEmail;
    private String facilityName;
    private String facilityAddress;
    private String unitCode;
    private Integer contractId;
    private Integer reservationId;
    private List<Line> lines;        // các dòng chi tiết của hóa đơn
    private BigDecimal total;        // tổng cộng khách phải trả (hoặc được hoàn)
    private List<String> notes;      // ghi chú của nhân viên / manager, giải thích thêm
    private List<String> relatedRepairs; // yêu cầu sửa chữa trong thời gian thuê (nếu có)
    private LocalDateTime waivedAt;
    private String waivedReason;
    private Refund refund;           // chỉ có với khoản cọc đã hoàn / khấu trừ

    @Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Line {
        private String label;
        private BigDecimal amount;     // dương: khách trả / cộng; âm: khấu trừ / giảm
        private String kind;           // CHARGE | DEDUCTION | INFO
    }

    @Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Refund {
        private BigDecimal depositPaid;
        private BigDecimal deducted;
        private BigDecimal refundAmount;
        private boolean transferred;       // công ty đã chuyển khoản hoàn chưa
        private LocalDateTime transferredAt;
        private String transferReference;
    }
}

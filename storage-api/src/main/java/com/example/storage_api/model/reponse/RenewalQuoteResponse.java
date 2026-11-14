package com.example.storage_api.model.reponse;

import java.math.BigDecimal;

/** Báo giá gia hạn: giá khách đang trả so với giá gia hạn hiện hành, để khách xác nhận khi giá đã đổi. */
public record RenewalQuoteResponse(
        Integer contractId,
        Integer months,
        BigDecimal currentMonthlyRate,
        BigDecimal newMonthlyRate,
        BigDecimal totalAmount,
        boolean priceChanged,
        BigDecimal changePercent) {
}

package com.example.storage_api.model.reponse;

import java.math.BigDecimal;

/** Báo giá đặt kho tính ở backend (một nguồn duy nhất): giá niêm yết, giảm giá, tổng tiền và tiền cọc. */
public record ReservationQuoteResponse(
        BigDecimal monthlyPrice,
        int months,
        BigDecimal listTotal,
        BigDecimal discountAmount,
        BigDecimal total,
        BigDecimal depositAmount) {
}

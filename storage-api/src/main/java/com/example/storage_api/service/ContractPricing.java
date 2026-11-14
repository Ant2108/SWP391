package com.example.storage_api.service;

import com.example.storage_api.entity.Reservation;

import java.math.BigDecimal;

/**
 * Giá thuê tháng ghi trên hợp đồng = giá niêm yết đã chốt lúc khách đặt kho.
 * Nhờ vậy Business Manager đổi giá giữa lúc đặt và lúc tạo hợp đồng cũng không làm đổi giá của khách.
 * Giảm giá chỉ áp cho kỳ thuê đầu (đã nằm trong tổng tiền của đơn), gia hạn và phí quá hạn tính theo giá niêm yết này.
 * Đơn cũ chưa có giá chốt thì lùi về giá hiện hành ({@code fallback}).
 */
public final class ContractPricing {
    private ContractPricing() {
    }

    public static BigDecimal lockedMonthlyPrice(Reservation r, BigDecimal fallback) {
        if (r != null && r.getListMonthlyPrice() != null && r.getListMonthlyPrice().signum() > 0) {
            return r.getListMonthlyPrice();
        }
        return fallback;
    }
}

package com.example.storage_api.entity;

/**
 * Cách tính giá của một PriceRule (cột CalculationType trong bảng price_rules).
 *
 * Quy ước dùng cột nào:
 *  - PERCENTAGE                    => dùng cột Percentage (vd 10 nghĩa là 10%).
 *  - FIXED / PER_DAY / PER_MONTH   => dùng cột Amount (số tiền).
 */
public enum CalculationType {
    // Số tiền cố định, tính một lần.
    FIXED,
    // Số tiền tính theo từng ngày.
    PER_DAY,
    // Số tiền tính theo từng tháng.
    PER_MONTH,
    // Tính theo phần trăm.
    PERCENTAGE
}

package com.example.storage_api.entity;

/**
 * Loại giá của một PriceRule (cột PriceType trong bảng price_rules).
 * Cho biết rule này là "giá cái gì".
 */
public enum PriceType {
    // Giá thuê kho.
    RENTAL,
    // Tiền đặt cọc.
    DEPOSIT,
    // Phí gia hạn hợp đồng.
    RENEWAL,
    // Phí trả chậm / quá hạn.
    OVERDUE,
    // Phụ phí phát sinh.
    EXTRA_FEE,
    // Phí đền bù hư hỏng.
    DAMAGE_FEE,
    // Giảm giá.
    DISCOUNT
}

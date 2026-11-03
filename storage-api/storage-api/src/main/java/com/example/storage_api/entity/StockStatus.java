package com.example.storage_api.entity;

/**
 * Tình trạng hàng (kho) của một Facility, do quản lý đặt tay (cột StockStatus trong bảng facilities).
 * Khác với FacilityStatus (cơ sở có đang hoạt động hay đã disable).
 */
public enum StockStatus {
    // Đang có kho cho thuê.
    AVAILABLE,
    // Sắp có: cơ sở đã công bố nhưng chưa mở cho thuê.
    COMING_SOON,
    // Hết hàng: tạm thời không còn kho để thuê.
    OUT_OF_STOCK
}

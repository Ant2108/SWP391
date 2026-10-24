package com.example.storage_api.entity;

/**
 * Trạng thái của một ô kho (cột Status trong bảng storage_units).
 *
 * Requirement chưa quy định "trạng thái nào được chuyển sang trạng thái nào",
 * nên hệ thống cho phép đổi qua lại giữa mọi giá trị.
 */
public enum UnitStatus {
    // Còn trống, có thể cho thuê.
    AVAILABLE,
    // Đã được giữ chỗ.
    RESERVED,
    // Đang có khách thuê.
    OCCUPIED,
    // Đang kiểm tra.
    INSPECTION,
    // Đang bảo trì.
    MAINTENANCE
}

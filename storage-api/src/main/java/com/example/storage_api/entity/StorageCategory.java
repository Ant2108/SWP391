package com.example.storage_api.entity;

/**
 * Nhóm dịch vụ của một loại kho (cột StorageCategory trong bảng UnitTypes).
 *
 * Gắn ở UnitType (không gắn ở từng StorageUnit) vì kích thước và bảng giá đều theo UnitType:
 * muốn thêm kho lạnh thì tạo UnitType có category COLD, rồi tạo PriceRule cho UnitType đó.
 */
public enum StorageCategory {
    // Kho bình thường (khô, không kiểm soát nhiệt độ). Giá trị mặc định.
    STANDARD,
    // Kho lạnh (kiểm soát nhiệt độ thấp).
    COLD
}

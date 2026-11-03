package com.example.storage_api.entity;

/**
 * Trạng thái của Facility (cột Status trong bảng facilities).
 *
 * Enum = danh sách giá trị cố định. Nhờ enum, code không thể gán một trạng thái bậy (vd "ACTVE").
 * Trong entity dùng @Enumerated(EnumType.STRING) nên DB lưu đúng chữ "ACTIVE" / "INACTIVE" / "MAINTENANCE".
 */
public enum FacilityStatus {
    // Đang hoạt động bình thường.
    ACTIVE,
    // Đã bị disable. Disable là "tắt mềm": chỉ đổi Status, KHÔNG xoá row khỏi DB.
    INACTIVE,
    // Đang bảo trì.
    MAINTENANCE
}

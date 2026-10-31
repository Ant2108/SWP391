package com.example.storage_api.entity;

/**
 * Trạng thái của hợp đồng thuê kho (RentalContract).
 * PENDING: Hợp đồng được khởi tạo sau khi Reservation CONFIRMED + đặt cọc PAID, chờ khách Check-in.
 * ACTIVE: Đã hoàn tất Check-in, khách đang sử dụng kho.
 * OVERDUE: Hợp đồng quá hạn thuê.
 * COMPLETED: Đã hoàn tất trả kho (Return).
 * CANCELLED: Hợp đồng bị hủy trước khi kích hoạt.
 */
public enum ContractStatus {
    PENDING,
    ACTIVE,
    OVERDUE,
    COMPLETED,
    CANCELLED
}

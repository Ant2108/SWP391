package com.example.storage_api.entity;

// TEMP – Member 3: thay bằng bản của Member 3 khi gộp code.
// PENDING = hợp đồng đã tạo (sau khi Reservation CONFIRMED + cọc PAID), chờ check-in để chuyển ACTIVE.
public enum ContractStatus {
    PENDING,
    ACTIVE,
    OVERDUE,
    COMPLETED,
    CANCELLED
}

package com.example.storage_api.entity;

/** Tiến trình xử lý hư hại: REPORTED (staff báo, chờ sửa và chốt phí) -> FEE_ISSUED (đã chốt phí, đã bù trừ cọc / lập hóa đơn). */
public enum DamageStatus {
    REPORTED,
    FEE_ISSUED
}

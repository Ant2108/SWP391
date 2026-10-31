package com.example.storage_api.entity;

/**
 * Các loại khoản thanh toán (Payment) trong hệ thống thuê kho.
 */
public enum PaymentType {
    DEPOSIT,
    RENTAL,
    RENEWAL,
    OVERDUE_FEE,
    EXTRA_FEE,
    DAMAGE_FEE
}

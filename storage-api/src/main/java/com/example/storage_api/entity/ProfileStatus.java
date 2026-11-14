package com.example.storage_api.entity;

/** Trạng thái hồ sơ thông tin hợp đồng của khách. */
public enum ProfileStatus {
    DRAFT,      // đang điền (chưa gửi)
    SUBMITTED,  // đã gửi, chờ quản lý kiểm tra
    APPROVED,   // đã được duyệt
    REJECTED    // bị từ chối, khách cần chỉnh và ký lại
}

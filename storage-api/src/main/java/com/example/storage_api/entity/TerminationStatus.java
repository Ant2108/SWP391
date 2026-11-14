package com.example.storage_api.entity;

/**
 * Tiến trình yêu cầu hủy hợp đồng sớm (sau khi khách đã nhận kho).
 * REQUESTED: khách đã yêu cầu, chờ quản lý liên hệ và cử nhân viên kiểm tra kho.
 * INSPECTED: nhân viên đã kiểm tra kho, chờ quản lý xác nhận hủy (và chốt phí hư hại nếu có).
 * COMPLETED: quản lý đã xác nhận, hợp đồng kết thúc và đã tính tiền.
 * REJECTED: quản lý từ chối, hợp đồng tiếp tục như cũ.
 * WITHDRAWN: khách rút lại yêu cầu.
 */
public enum TerminationStatus {
    REQUESTED,
    INSPECTED,
    COMPLETED,
    REJECTED,
    WITHDRAWN
}

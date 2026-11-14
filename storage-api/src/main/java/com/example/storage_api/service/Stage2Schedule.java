package com.example.storage_api.service;

import com.example.storage_api.entity.Reservation;

import java.time.LocalDate;

/**
 * Hạn thanh toán tiền thuê (Đợt 2): khách phải trả đủ trong vòng NỬA tổng thời gian thuê kể từ ngày bắt đầu thuê.
 * Tính theo ngày cho gọn: mỗi tháng thuê tương ứng 15 ngày (thuê 1 tháng: 15 ngày, 2 tháng: 30 ngày, 3 tháng: 45 ngày).
 */
public final class Stage2Schedule {
    /** Dấu hiệu nằm trong transactionReference của khoản phí trễ hạn đóng Đợt 2. */
    public static final String LATE_FEE_MARK = "TRE_DOT_2";

    private Stage2Schedule() {
    }

    public static LocalDate dueDate(Reservation r) {
        if (r == null || r.getStartDate() == null || r.getRentalMonths() == null) {
            return null;
        }
        return r.getStartDate().plusDays(15L * r.getRentalMonths());
    }
}

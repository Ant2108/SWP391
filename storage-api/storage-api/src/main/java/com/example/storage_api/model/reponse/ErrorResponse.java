package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Body JSON khi có lỗi, do APIExceptionHandler tạo ra. Ví dụ:
 * { "status": 404, "message": "Facility not found: 99", "timestamp": "2026-10-01T10:00:00" }
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ErrorResponse {
    // Mã HTTP (400, 404, 409...).
    private int status;
    // Nội dung lỗi cho người dùng / lập trình viên đọc.
    private String message;
    // Thời điểm xảy ra lỗi.
    private LocalDateTime timestamp;

    // Constructor tiện lợi: chỉ cần truyền status + message, timestamp tự lấy giờ hiện tại.
    public ErrorResponse(int status, String message) {
        this(status, message, LocalDateTime.now());
    }
}

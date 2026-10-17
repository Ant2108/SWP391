package com.example.storage_api.exception.exceptions;

/**
 * Ném ra khi dữ liệu client gửi vi phạm quy tắc nghiệp vụ
 * (vd UnitType không thuộc Facility, thiếu Amount, EffectiveTo nhỏ hơn EffectiveFrom).
 * APIExceptionHandler bắt exception này và trả HTTP 400.
 */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}

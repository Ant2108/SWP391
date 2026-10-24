package com.example.storage_api.exception.exceptions;

/**
 * Ném ra khi dữ liệu bị trùng hoặc mơ hồ
 * (vd trùng TypeName trong cùng Facility, hoặc có nhiều PriceRule cùng hiệu lực cho một scope).
 * APIExceptionHandler bắt exception này và trả HTTP 409.
 */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}

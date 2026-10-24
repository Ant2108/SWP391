package com.example.storage_api.exception.exceptions;

/**
 * Ném ra khi không tìm thấy dữ liệu (vd Facility id không tồn tại).
 * APIExceptionHandler bắt exception này và trả HTTP 404.
 *
 * Kế thừa RuntimeException (unchecked) nên không cần khai báo "throws" ở mọi method.
 */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message); // message sẽ hiện trong trường "message" của ErrorResponse
    }
}

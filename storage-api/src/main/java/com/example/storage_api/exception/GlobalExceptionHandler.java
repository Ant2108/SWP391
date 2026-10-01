package com.example.storage_api.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AppException.class)
    public ResponseEntity<Map<String, String>> handleAppException(AppException ex) {

        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("message", ex.getMessage());
        errorResponse.put("error", ex.getStatus().getReasonPhrase());

        return new ResponseEntity<>(
                errorResponse,
                ex.getStatus()
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(
            IllegalArgumentException ex) {

        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("message", ex.getMessage());
        errorResponse.put("error", "Bad Request");

        return new ResponseEntity<>(
                errorResponse,
                HttpStatus.BAD_REQUEST
        );
    }

    /**
     * Handles Spring Security access-denied errors (403).
     * Uses the existing error response format: { "error": "...", "message": "..." }
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDeniedException(
            AccessDeniedException ex) {

        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("message", "You do not have permission to access this resource");
        errorResponse.put("error", "Forbidden");

        return new ResponseEntity<>(
                errorResponse,
                HttpStatus.FORBIDDEN
        );
    }

    /**
     * Handles @Valid / @Validated bean-validation failures (400).
     * Returns field-level validation messages using the existing format.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationException(
            MethodArgumentNotValidException ex) {

        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("error", "Bad Request");

        // Collect the first field error message as the top-level message
        String message = ex.getBindingResult().getFieldErrors()
                .stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("Validation failed");
        errorResponse.put("message", message);

        // Also include all field errors
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            errorResponse.put(fe.getField(), fe.getDefaultMessage());
        }

        return new ResponseEntity<>(
                errorResponse,
                HttpStatus.BAD_REQUEST
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGenericException(
            Exception ex) {

        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("message", "Internal server error");
        errorResponse.put("error", "Internal Server Error");

        return new ResponseEntity<>(
                errorResponse,
                HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
}
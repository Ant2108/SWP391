package com.example.storage_api.exception;

import com.example.storage_api.controller.FacilityController;
import com.example.storage_api.controller.FileController;
import com.example.storage_api.controller.PriceRuleController;
import com.example.storage_api.controller.StorageUnitController;
import com.example.storage_api.controller.UnitTypeController;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.ErrorResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.stream.Collectors;

/**
 * "Trạm bắt lỗi" chung: khi Controller/Service ném exception, Spring chuyển tới đây để
 * đổi exception thành một ErrorResponse { status, message, timestamp } với mã HTTP phù hợp.
 * Nhờ vậy Service chỉ cần "throw", không phải tự dựng response lỗi.
 *
 * Luồng lỗi: Service throw ResourceNotFoundException -> Spring tìm @ExceptionHandler khớp -> trả JSON 404.
 *
 * assignableTypes: chỉ áp dụng cho 4 controller của module này, để không đổi format lỗi của module Users
 * (module đó có GlobalExceptionHandler riêng). Exception không được xử lý ở đây sẽ rơi xuống handler kia.
 * @Order(HIGHEST_PRECEDENCE): handler này được thử trước handler chung.
 */
@RestControllerAdvice(assignableTypes = {
        FacilityController.class,
        UnitTypeController.class,
        StorageUnitController.class,
        PriceRuleController.class,
        FileController.class
})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class APIExceptionHandler {

    // Không tìm thấy dữ liệu -> 404.
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    // Dữ liệu vi phạm nghiệp vụ -> 400.
    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException ex) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    // Trùng dữ liệu / nhiều rule cùng hiệu lực -> 409.
    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
        return build(HttpStatus.CONFLICT, ex.getMessage());
    }

    // @Valid trên request body thất bại (vd thiếu name) -> 400. Gộp mọi lỗi field vào một message.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        // Bước 1: lấy danh sách lỗi theo từng field. Bước 2: lấy message của từng lỗi. Bước 3: nối bằng "; ".
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return build(HttpStatus.BAD_REQUEST, message.isEmpty() ? "Validation failed" : message);
    }

    // JSON sai cú pháp, hoặc enum sai giá trị trong body -> 400.
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "Malformed request body or invalid field value");
    }

    // Query param / path variable sai kiểu, vd ?status=ABC hoặc /facilities/abc -> 400.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "Invalid value for parameter '" + ex.getName() + "'");
    }

    // Thiếu query param bắt buộc (vd GET /api/unit-types không có facilityId) -> 400.
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParam(MissingServletRequestParameterException ex) {
        return build(HttpStatus.BAD_REQUEST, "Missing required parameter '" + ex.getParameterName() + "'");
    }

    // Lưới an toàn: hai request đồng thời cùng vượt qua bước kiểm tra trùng thì UNIQUE của DB chặn lại -> 409.
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleIntegrity(DataIntegrityViolationException ex) {
        return build(HttpStatus.CONFLICT, "Data conflicts with an existing record");
    }

    // Hàm dùng chung: dựng ResponseEntity gồm mã HTTP + ErrorResponse.
    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ErrorResponse(status.value(), message));
    }
}

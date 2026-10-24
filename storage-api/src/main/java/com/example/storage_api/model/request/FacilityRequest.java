package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalTime;

/**
 * Request Model = "hình dạng JSON mà client được phép gửi lên".
 * Dùng riêng class này thay vì nhận thẳng Entity để client không thể tự ý gửi id, createdAt, status...
 *
 * Body của POST /api/facilities và PUT /api/facilities/{id}.
 * Không có status: Facility mới luôn ACTIVE, đổi sang INACTIVE qua PATCH /api/facilities/{id}/disable.
 *
 * Luồng: Postman gửi JSON -> Spring (Jackson) đổi JSON thành object FacilityRequest
 *        -> @Valid kiểm tra các annotation bên dưới -> nếu đạt mới vào Service.
 */
@Getter
@Setter
@NoArgsConstructor // Jackson cần constructor rỗng để tạo object rồi gán từng field
public class FacilityRequest {

    // @NotBlank: không được null, không được rỗng "", không được toàn dấu cách. message = nội dung lỗi trả về 400.
    // @Size(max = 150): tối đa 150 ký tự (khớp độ dài cột trong DB).
    @NotBlank(message = "Facility name is required")
    @Size(max = 150, message = "Facility name must be at most 150 characters")
    private String name;

    @NotBlank(message = "Address is required")
    @Size(max = 300, message = "Address must be at most 300 characters")
    private String address;

    // Không có @NotBlank => tuỳ chọn, được bỏ trống.
    @Size(max = 20, message = "Phone must be at most 20 characters")
    private String phone;

    // JSON gửi dạng "08:00", Jackson tự đổi thành LocalTime.
    private LocalTime openingTime;

    private LocalTime closingTime;
}

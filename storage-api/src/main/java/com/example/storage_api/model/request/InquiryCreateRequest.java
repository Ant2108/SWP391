package com.example.storage_api.model.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của POST /api/inquiries (công khai: không cần đăng nhập). */
@Getter
@Setter
@NoArgsConstructor
public class InquiryCreateRequest {

    @NotNull(message = "Cơ sở là bắt buộc")
    private Long facilityId;

    @NotBlank(message = "Tên là bắt buộc")
    @Size(max = 150, message = "Tên tối đa 150 ký tự")
    private String name;

    @NotBlank(message = "Email là bắt buộc")
    @Email(message = "Email không hợp lệ")
    @Size(max = 150, message = "Email tối đa 150 ký tự")
    private String email;

    @Size(max = 20, message = "Số điện thoại tối đa 20 ký tự")
    private String phone;

    @NotBlank(message = "Chủ đề là bắt buộc")
    @Size(max = 200, message = "Chủ đề tối đa 200 ký tự")
    private String subject;

    @NotBlank(message = "Nội dung là bắt buộc")
    @Size(max = 1000, message = "Nội dung tối đa 1000 ký tự")
    private String message;

    /** Ô ẩn chống bot: người thật không nhìn thấy nên luôn để trống. Có nội dung thì bỏ qua yêu cầu. */
    private String website;
}

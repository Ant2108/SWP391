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

    @NotNull(message = "Facility is required")
    private Long facilityId;

    @NotBlank(message = "Name is required")
    @Size(max = 150, message = "Name must be at most 150 characters")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Email is not valid")
    @Size(max = 150, message = "Email must be at most 150 characters")
    private String email;

    @Size(max = 20, message = "Phone must be at most 20 characters")
    private String phone;

    @NotBlank(message = "Subject is required")
    @Size(max = 200, message = "Subject must be at most 200 characters")
    private String subject;

    @NotBlank(message = "Message is required")
    @Size(max = 1000, message = "Message must be at most 1000 characters")
    private String message;

    /** Ô ẩn chống bot: người thật không nhìn thấy nên luôn để trống. Có nội dung thì bỏ qua yêu cầu. */
    private String website;
}

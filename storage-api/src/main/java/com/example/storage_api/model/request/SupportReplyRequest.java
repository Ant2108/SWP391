package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của POST /api/support-requests/{id}/replies. */
@Getter
@Setter
@NoArgsConstructor
public class SupportReplyRequest {

    @NotBlank(message = "Nội dung là bắt buộc")
    @Size(max = 1000, message = "Nội dung tối đa 1000 ký tự")
    private String message;
}

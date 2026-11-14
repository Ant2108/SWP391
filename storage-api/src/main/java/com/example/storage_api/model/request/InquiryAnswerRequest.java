package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của PATCH /api/inquiries/{id}/answer. */
@Getter
@Setter
@NoArgsConstructor
public class InquiryAnswerRequest {

    @NotBlank(message = "Nội dung trả lời là bắt buộc")
    @Size(max = 1000, message = "Nội dung trả lời tối đa 1000 ký tự")
    private String answer;
}

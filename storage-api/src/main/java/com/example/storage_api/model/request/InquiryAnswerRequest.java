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

    @NotBlank(message = "Answer is required")
    @Size(max = 1000, message = "Answer must be at most 1000 characters")
    private String answer;
}

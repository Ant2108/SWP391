package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TerminationRejectRequest {
    @NotBlank(message = "Vui lòng nhập lý do từ chối")
    @Size(max = 500, message = "Lý do tối đa 500 ký tự")
    private String reason;
}

package com.example.storage_api.model.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TerminationRequest {
    /** Khách phải tích đồng ý điều khoản hủy sớm. */
    private Boolean agreed;

    @Size(max = 500, message = "Lý do tối đa 500 ký tự")
    private String reason;
}

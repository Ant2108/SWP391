package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UpdateStatusRequest {

    @NotBlank(message = "Status is required")
    private String status;
}

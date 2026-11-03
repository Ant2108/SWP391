package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ConfirmEmailChangeRequest {

    @NotBlank
    private String token;
}

package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UpdateRoleRequest {

    @NotBlank(message = "Vai trò là bắt buộc")
    private String role;
}

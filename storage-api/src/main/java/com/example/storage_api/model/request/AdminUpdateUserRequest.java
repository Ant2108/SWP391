package com.example.storage_api.model.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AdminUpdateUserRequest {

    @NotBlank(message = "Fullname is required")
    @Size(min = 2, max = 100, message = "Fullname must be between 2 and 100 characters")
    private String fullname;

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Phone is required")
    @Pattern(
            regexp = "^(0[0-9]{9})$",
            message = "Phone must be a valid Vietnamese phone number"
    )
    private String phone;
}

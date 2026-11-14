package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FacilityAssignmentRequest {
    @NotNull(message = "Mã người dùng là bắt buộc")
    private Long userId;

    @NotNull(message = "Mã cơ sở là bắt buộc")
    private Long facilityId;
}

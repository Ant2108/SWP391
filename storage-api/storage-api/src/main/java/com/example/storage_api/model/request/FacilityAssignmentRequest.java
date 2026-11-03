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
    @NotNull(message = "User ID is required")
    private Long userId;

    @NotNull(message = "Facility ID is required")
    private Long facilityId;
}

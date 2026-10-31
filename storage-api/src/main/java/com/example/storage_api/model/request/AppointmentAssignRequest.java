package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của PATCH /api/appointments/{id}/assign và /api/support-requests/{id}/assign. */
@Getter
@Setter
@NoArgsConstructor
public class AppointmentAssignRequest {

    @NotNull(message = "Staff ID is required")
    private Long staffId;
}

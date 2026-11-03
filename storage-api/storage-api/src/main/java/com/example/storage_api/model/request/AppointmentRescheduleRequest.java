package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** Body của PATCH /api/appointments/{id}/reschedule. */
@Getter
@Setter
@NoArgsConstructor
public class AppointmentRescheduleRequest {

    @NotNull(message = "Scheduled time is required")
    private LocalDateTime scheduledAt;
}

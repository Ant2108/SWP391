package com.example.storage_api.model.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body của PATCH /api/appointments/{id}/complete.
 * Với CHECK_IN, keyHandedOver phải = true (bàn giao chìa khóa vật lý cho khách).
 */
@Getter
@Setter
@NoArgsConstructor
public class AppointmentCompleteRequest {

    private Boolean keyHandedOver;

    @Size(max = 300, message = "Notes must be at most 300 characters")
    private String notes;
}

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

    @Size(max = 300, message = "Ghi chú tối đa 300 ký tự")
    private String notes;
}

package com.example.storage_api.model.request;

import com.example.storage_api.entity.AppointmentType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Body của POST /api/appointments.
 * CHECK_IN cần reservationId; RETURN / SUPPORT cần rentalContractId.
 * customerId chỉ dùng khi staff/manager đặt hộ khách (customer tự đặt thì bỏ qua).
 */
@Getter
@Setter
@NoArgsConstructor
public class AppointmentCreateRequest {

    @NotNull(message = "Appointment type is required")
    private AppointmentType appointmentType;

    private Integer reservationId;

    private Integer rentalContractId;

    private Long customerId;

    @NotNull(message = "Scheduled time is required")
    private LocalDateTime scheduledAt;

    @Size(max = 500, message = "Notes must be at most 500 characters")
    private String notes;
}

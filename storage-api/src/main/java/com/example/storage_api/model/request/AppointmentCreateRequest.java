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

    @NotNull(message = "Loại lịch hẹn là bắt buộc")
    private AppointmentType appointmentType;

    private Integer reservationId;

    private Integer rentalContractId;

    private Long customerId;

    @NotNull(message = "Thời gian hẹn là bắt buộc")
    private LocalDateTime scheduledAt;

    @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
    private String notes;
}

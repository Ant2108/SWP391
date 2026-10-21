package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** JSON trả về cho Appointment. noShowReported = staff đã báo khách vắng, đang chờ manager xử lý. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppointmentResponse {
    private Integer id;
    private AppointmentType appointmentType;
    private AppointmentStatus status;
    private LocalDateTime scheduledAt;
    private String notes;
    private boolean noShowReported;
    private Long customerId;
    private String customerName;
    private String customerPhone;
    private Long facilityId;
    private String facilityName;
    private Integer reservationId;
    private Integer rentalContractId;
    private Integer storageUnitId;
    private String unitCode;
    private Long staffId;
    private String staffName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

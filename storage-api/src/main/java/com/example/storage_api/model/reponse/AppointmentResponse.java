package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
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

    // ---- Chỉ có nghĩa với lịch CHECK_IN (lấy từ đơn đặt kho của Member 3) ----
    /** NOT_PAID (chưa trả cọc đợt 1) / HOLDING (đang giữ kho) / CHECKED_IN / CANCELLED / NO_SHOW; RETURN, SUPPORT = status. */
    private String displayStatus;
    private String facilityAddress;
    /** Ngày khách đặt đơn (Reservation.createdAt). */
    private LocalDateTime orderedAt;
    /** Hạn trả cọc đợt 1 (Reservation.createdAt + 24h theo luật của Member 3). */
    private LocalDateTime paymentDeadline;
    /** Ngày muộn nhất manager được dời lịch nhận kho (cùng cách tính maxHandoverDate của Member 3). */
    private LocalDate maxHandoverDate;
    private boolean depositPaid;
    /** Đợt 2 (tiền thuê) đã thu chưa; staff chỉ check-in được khi true. */
    private boolean rentalPaid;
    /** Khách đã ký hợp đồng điện tử chưa; staff chỉ check-in được khi true. */
    private boolean contractSigned;
    private Integer pendingRentalPaymentId;
    /** Trạng thái đơn đặt kho; check-in chỉ làm được khi CONFIRMED và đã gán ô kho. */
    private String reservationStatus;
    private boolean unitAssigned;
}

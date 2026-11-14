package com.example.storage_api.model.request;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class ReservationCreateRequest {
    @NotNull private Long facilityId;
    @NotNull private Integer unitTypeId;
    @NotNull @FutureOrPresent(message = "Ngày nhận kho không được ở quá khứ") private LocalDate startDate;
    @NotNull @Min(1) @Max(24) private Integer rentalMonths;
    // Giờ nhận kho (09:00 - 17:00); không gửi thì mặc định 09:00.
    private java.time.LocalTime pickupTime;
    // Thời lượng dự kiến cho buổi nhận kho: 30 hoặc 60 phút (mặc định 30).
    private Integer pickupDurationMinutes;
    // Khách đã đọc cảnh báo và đồng ý chịu trách nhiệm (bắt buộc khi đã 2 lần liên tiếp không thanh toán).
    private Boolean acknowledgedWarning;
}

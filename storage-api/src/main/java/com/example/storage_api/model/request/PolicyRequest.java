package com.example.storage_api.model.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PolicyRequest {
    @NotNull(message = "Số ngày hoàn đủ cọc là bắt buộc")
    @Min(value = 1, message = "Số ngày hoàn đủ cọc phải từ 1 trở lên")
    private Integer fullRefundDays;

    @NotNull(message = "Mốc trừ phí theo ngày là bắt buộc")
    private Integer dailyDeductUntilDays;

    @NotNull(message = "Tỉ lệ hoàn giai đoạn cuối là bắt buộc")
    @Min(value = 0, message = "Tỉ lệ hoàn từ 0 đến 100")
    @Max(value = 100, message = "Tỉ lệ hoàn từ 0 đến 100")
    private Integer lateRefundPercent;

    @NotNull(message = "Mốc mất cọc là bắt buộc")
    private Integer forfeitDays;

    @NotNull(message = "Số tháng tối đa của một đơn đặt kho là bắt buộc")
    @Min(value = 1, message = "Đơn đặt kho tối thiểu 1 tháng")
    @Max(value = 12, message = "Đơn đặt kho tối đa 12 tháng")
    private Integer maxBookingMonths;

    @NotNull(message = "Số tháng tối đa mỗi lần gia hạn là bắt buộc")
    @Min(value = 1, message = "Mỗi lần gia hạn tối thiểu 1 tháng")
    @Max(value = 12, message = "Mỗi lần gia hạn tối đa 12 tháng")
    private Integer maxRenewalMonths;

    @NotNull(message = "Số tháng tối đa được chọn trước ngày nhận kho là bắt buộc")
    @Min(value = 1, message = "Tối thiểu 1 tháng")
    @Max(value = 6, message = "Tối đa 6 tháng")
    private Integer maxStartMonths;

    @NotNull(message = "Số giờ giữ đơn chưa đóng cọc là bắt buộc")
    @Min(value = 1, message = "Tối thiểu 1 giờ")
    @Max(value = 168, message = "Tối đa 168 giờ (7 ngày)")
    private Integer unpaidHoldHours;

    @NotNull(message = "Số ngày được trễ hạn đóng tiền thuê là bắt buộc")
    @Min(value = 1, message = "Tối thiểu 1 ngày")
    @Max(value = 60, message = "Tối đa 60 ngày")
    private Integer stage2GraceDays;

    @Min(value = 0, message = "Số ngày báo trước từ 0 trở lên")
    @Max(value = 60, message = "Báo trước tối đa 60 ngày")
    private Integer earlyTerminationNoticeDays;

    @Min(value = 0, message = "Phần trăm cọc bị giữ từ 0 đến 100")
    @Max(value = 100, message = "Phần trăm cọc bị giữ từ 0 đến 100")
    private Integer earlyTerminationForfeitPercent;
}

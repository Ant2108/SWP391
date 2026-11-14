package com.example.storage_api.model.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RenewalRequest {
    @NotNull
    @Min(1)
    @Max(12)
    private Integer months;

    /** Khách xác nhận đồng ý giá gia hạn mới khi giá đã thay đổi so với giá đang trả. */
    private Boolean confirmPriceChange;

    private String paymentMethod;

    private String transactionReference;

    /**
     * Khách hàng không được tự đặt paid=true; khoản gia hạn tạo ở trạng thái PENDING
     * và khi nhân viên/quản lý xác nhận PAID sẽ tự động cộng thêm tháng vào EndDate.
     */
    private Boolean paid;
}

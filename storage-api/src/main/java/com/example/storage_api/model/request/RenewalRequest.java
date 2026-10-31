package com.example.storage_api.model.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RenewalRequest {
    @NotNull
    @Min(1)
    private Integer months;

    private String paymentMethod;

    private String transactionReference;

    /**
     * Nếu true (hoặc null khi gọi nhanh), tạo Payment RENEWAL ở trạng thái PAID và cập nhật EndDate ngay.
     * Nếu false, tạo Payment RENEWAL ở trạng thái PENDING và khi thanh toán PAID sẽ tự động cập nhật EndDate.
     */
    private Boolean paid;
}

package com.example.storage_api.model.request;

import com.example.storage_api.entity.PaymentType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
public class PaymentCreateRequest {
    private Integer paymentId;
    private Integer reservationId;
    private Integer rentalContractId;

    @NotNull
    private PaymentType paymentType;

    @DecimalMin(value = "0.01")
    private BigDecimal amount;

    @Size(max = 50)
    private String paymentMethod;

    private Boolean paid;

    @Size(max = 150)
    private String transactionReference;

    private Integer renewalMonths;
}

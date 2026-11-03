package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentResponse {
    private Integer id;
    private Long customerId;
    private String customerName;
    private Integer reservationId;
    private Integer rentalContractId;
    private Long facilityId;
    private String facilityName;
    private String unitCode;
    private PaymentType paymentType;
    private BigDecimal amount;
    private String paymentMethod;
    private String transactionReference;
    private PaymentStatus status;
    private LocalDateTime paidAt;
    private LocalDateTime createdAt;
}

package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.ReservationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservationResponse {
    private Integer id;
    private Long customerId;
    private String customerName;
    private Long facilityId;
    private String facilityName;
    private Integer unitTypeId;
    private String unitTypeName;
    private Integer storageUnitId;
    private String unitCode;
    private LocalDate startDate;
    private Integer rentalMonths;
    private BigDecimal estimatedAmount;
    private BigDecimal depositAmount;
    private Boolean depositPaid;
    private Integer pendingDepositPaymentId;
    private Integer rentalContractId;
    private ContractStatus contractStatus;
    private ReservationStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

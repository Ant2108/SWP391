package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.ContractStatus;
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
public class RentalContractResponse {
    private Integer id;
    private Integer reservationId;
    private Long customerId;
    private String customerName;
    private Long facilityId;
    private String facilityName;
    private Integer unitTypeId;
    private String unitTypeName;
    private Integer storageUnitId;
    private String unitCode;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer rentalMonths;
    private BigDecimal monthlyPrice;
    private BigDecimal stage2RentalAmount;
    private BigDecimal depositAmount;
    private Boolean depositPaid;
    private Boolean stage2RentalPaid;
    private ContractStatus status;
    private Boolean overdue;
    private LocalDateTime signedAt;
    private String signerName;
    private String signatureUrl;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

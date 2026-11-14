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
    private LocalDate maxHandoverDate;
    private LocalDate rentalDueDate; // hạn đóng tiền thuê Đợt 2 (nửa thời gian thuê kể từ ngày bắt đầu)
    private Integer rentalMonths;
    private BigDecimal estimatedAmount;
    private BigDecimal depositAmount;
    private BigDecimal refundableDepositAmount;
    private BigDecimal stage2RentalAmount;
    private Boolean depositPaid;
    private Boolean stage2RentalPaid;
    private String paymentStatusLabel;
    private LocalDateTime paymentDeadline;
    private Integer pendingDepositPaymentId;
    private Integer pendingRentalPaymentId;
    private Integer rentalContractId;
    private ContractStatus contractStatus;
    private ReservationStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

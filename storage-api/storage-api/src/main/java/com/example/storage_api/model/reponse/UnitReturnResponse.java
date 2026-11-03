package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.UnitStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** JSON trả về cho UnitReturn; kèm kết quả: trạng thái mới của unit và id khoản phí hư hại (nếu có). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UnitReturnResponse {
    private Integer id;
    private Integer rentalContractId;
    private Long customerId;
    private String customerName;
    private Long staffId;
    private String staffName;
    private Integer storageUnitId;
    private String unitCode;
    private UnitStatus unitStatus;
    private LocalDateTime returnedAt;
    private String unitCondition;
    private boolean hasDamage;
    private String damageDescription;
    private BigDecimal damageFee;
    private Integer damagePaymentId;
    private String notes;
    private LocalDateTime createdAt;
}

package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Body của POST /api/unit-returns (staff kiểm tra kho khi khách trả).
 * hasDamage = true thì damageDescription và damageFee (> 0) bắt buộc.
 */
@Getter
@Setter
@NoArgsConstructor
public class UnitReturnRequest {

    @NotNull(message = "Rental contract ID is required")
    private Integer rentalContractId;

    // Tuỳ chọn: lịch RETURN liên quan. Bỏ trống thì hệ thống tự đóng lịch RETURN đang chờ của hợp đồng (nếu có).
    private Integer appointmentId;

    @Size(max = 500, message = "Unit condition must be at most 500 characters")
    private String unitCondition;

    @NotNull(message = "hasDamage is required")
    private Boolean hasDamage;

    @Size(max = 500, message = "Damage description must be at most 500 characters")
    private String damageDescription;

    private BigDecimal damageFee;

    @Size(max = 500, message = "Notes must be at most 500 characters")
    private String notes;
}

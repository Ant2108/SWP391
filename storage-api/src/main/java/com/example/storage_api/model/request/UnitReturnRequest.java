package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import com.example.storage_api.entity.DamageType;

import java.util.List;

/**
 * Body của POST /api/unit-returns (staff kiểm tra kho khi khách trả).
 * hasDamage = true thì phải tích ít nhất một loại hư hại hoặc mô tả (chọn OTHER thì mô tả bắt buộc).
 * Phí hư hại KHÔNG nhập ở bước kiểm tra: manager / staff cơ sở chốt sau khi sửa xong (PATCH .../damage-fee).
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

    // Các loại hư hại đã tích khi kiểm tra.
    private List<DamageType> damageItems;

    @Size(max = 500, message = "Notes must be at most 500 characters")
    private String notes;
}

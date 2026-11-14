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

    @NotNull(message = "Mã hợp đồng là bắt buộc")
    private Integer rentalContractId;

    // Tuỳ chọn: lịch RETURN liên quan. Bỏ trống thì hệ thống tự đóng lịch RETURN đang chờ của hợp đồng (nếu có).
    private Integer appointmentId;

    @Size(max = 500, message = "Tình trạng ô kho tối đa 500 ký tự")
    private String unitCondition;

    @NotNull(message = "Thông tin hư hại là bắt buộc")
    private Boolean hasDamage;

    @Size(max = 500, message = "Mô tả hư hại tối đa 500 ký tự")
    private String damageDescription;

    // Các loại hư hại đã tích khi kiểm tra.
    private List<DamageType> damageItems;

    @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
    private String notes;
}

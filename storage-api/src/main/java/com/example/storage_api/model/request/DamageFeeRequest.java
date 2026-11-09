package com.example.storage_api.model.request;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/** Body của PATCH /api/unit-returns/{id}/damage-fee: phí hư hại chốt sau khi sửa xong (0 = không thu). */
@Getter
@Setter
@NoArgsConstructor
public class DamageFeeRequest {

    // Phí theo từng hạng mục đã tích (key = mã DamageType, OTHER cho mục "other"). Tổng = phí hư hại.
    private java.util.Map<String, BigDecimal> itemFees;

    // Tổng phí gộp (dùng khi không chia theo hạng mục).
    private BigDecimal damageFee;
}

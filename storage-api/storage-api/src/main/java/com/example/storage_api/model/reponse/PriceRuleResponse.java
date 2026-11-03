package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.PriceType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * JSON trả về cho PriceRule. PriceRuleService copy dữ liệu từ entity PriceRule sang class này.
 * facilityId / unitTypeId = null nghĩa là rule không giới hạn theo phạm vi đó (vd rule toàn hệ thống).
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PriceRuleResponse {
    private Integer id;
    private Long facilityId;
    private Integer unitTypeId;
    private PriceType priceType;
    private CalculationType calculationType;
    private BigDecimal amount;
    private BigDecimal percentage;
    private LocalDate effectiveFrom;
    private LocalDate effectiveTo;
    private boolean active;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

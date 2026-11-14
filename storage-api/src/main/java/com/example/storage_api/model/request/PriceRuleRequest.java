package com.example.storage_api.model.request;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.PriceType;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Body của POST /api/price-rules và PUT /api/price-rules/{id}.
 *
 * facilityId = null => rule toàn hệ thống; unitTypeId = null => rule không phụ thuộc loại kho.
 *
 * Các quy tắc liên quan NHIỀU field cùng lúc không viết được bằng annotation, nên được kiểm tra trong
 * PriceRuleService: Amount/Percentage theo CalculationType, EffectiveTo >= EffectiveFrom, UnitType thuộc Facility.
 *
 * createdBy là tuỳ chọn: phần đăng nhập thuộc module khác nên ta không tự đoán "user hiện tại là ai".
 */
@Getter
@Setter
@NoArgsConstructor
public class PriceRuleRequest {

    // Không có @NotNull: được phép null (nghĩa là scope rộng).
    private Long facilityId;

    private Integer unitTypeId;

    @NotNull(message = "Loại giá là bắt buộc")
    private PriceType priceType;

    @NotNull(message = "Cách tính là bắt buộc")
    private CalculationType calculationType;

    // Có hay không còn tuỳ CalculationType (kiểm tra ở Service), nên ở đây chỉ giới hạn dạng số.
    // @PositiveOrZero: không âm (0 là hợp lệ, vd phí miễn). null vẫn qua; PriceRuleService.apply() bắt buộc đúng trường theo CalculationType.
    @PositiveOrZero(message = "Số tiền không được âm")
    @Digits(integer = 16, fraction = 2, message = "Số tiền không hợp lệ (tối đa 16 chữ số nguyên, 2 chữ số thập phân)")
    private BigDecimal amount;

    @PositiveOrZero(message = "Phần trăm không được âm")
    @Digits(integer = 6, fraction = 2, message = "Phần trăm không hợp lệ (tối đa 6 chữ số nguyên, 2 chữ số thập phân)")
    private BigDecimal percentage;

    @NotNull(message = "Ngày bắt đầu hiệu lực là bắt buộc")
    private LocalDate effectiveFrom;

    // null = chưa có ngày kết thúc.
    private LocalDate effectiveTo;

    private Long createdBy;
}

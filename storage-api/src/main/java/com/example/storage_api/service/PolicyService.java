package com.example.storage_api.service;

import com.example.storage_api.entity.BusinessPolicy;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.model.reponse.PolicyResponse;
import com.example.storage_api.model.request.PolicyRequest;
import com.example.storage_api.reponsitory.BusinessPolicyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Chính sách chung do Business Manager đặt: hủy đơn / hoàn cọc, giới hạn đặt kho và gia hạn.
 * Chưa đặt thì dùng mặc định: hoàn cọc 10 / 20 / 25% / 30 ngày, đặt tối đa 2 tháng, gia hạn tối đa 2 tháng,
 * ngày nhận kho tối đa 1 tháng, giữ đơn chưa đóng cọc 24 giờ.
 */
@Service
@RequiredArgsConstructor
public class PolicyService {
    private final BusinessPolicyRepository repository;

    @Transactional(readOnly = true)
    public PolicyResponse get() {
        BusinessPolicy p = repository.findById(1).orElse(null);
        return new PolicyResponse(
                pick(p == null ? null : p.getFullRefundDays(), 10),
                pick(p == null ? null : p.getDailyDeductUntilDays(), 20),
                pick(p == null ? null : p.getLateRefundPercent(), 25),
                pick(p == null ? null : p.getForfeitDays(), 30),
                pick(p == null ? null : p.getMaxBookingMonths(), 2),
                pick(p == null ? null : p.getMaxRenewalMonths(), 2),
                pick(p == null ? null : p.getMaxStartMonths(), 1),
                pick(p == null ? null : p.getUnpaidHoldHours(), 24),
                pick(p == null ? null : p.getStage2GraceDays(), 10),
                pick(p == null ? null : p.getEarlyTerminationNoticeDays(), 7),
                pick(p == null ? null : p.getEarlyTerminationForfeitPercent(), 100));
    }

    @Transactional
    public PolicyResponse update(PolicyRequest r) {
        if (!(r.getFullRefundDays() < r.getDailyDeductUntilDays() && r.getDailyDeductUntilDays() < r.getForfeitDays())) {
            throw new BadRequestException("Các mốc ngày phải tăng dần: hoàn đủ cọc < trừ phí theo ngày < mất cọc");
        }
        BusinessPolicy p = repository.findById(1).orElseGet(() -> {
            BusinessPolicy n = new BusinessPolicy();
            n.setId(1);
            return n;
        });
        p.setFullRefundDays(r.getFullRefundDays());
        p.setDailyDeductUntilDays(r.getDailyDeductUntilDays());
        p.setLateRefundPercent(r.getLateRefundPercent());
        p.setForfeitDays(r.getForfeitDays());
        p.setMaxBookingMonths(r.getMaxBookingMonths());
        p.setMaxRenewalMonths(r.getMaxRenewalMonths());
        p.setMaxStartMonths(r.getMaxStartMonths());
        p.setUnpaidHoldHours(r.getUnpaidHoldHours());
        p.setStage2GraceDays(r.getStage2GraceDays());
        if (r.getEarlyTerminationNoticeDays() != null) p.setEarlyTerminationNoticeDays(r.getEarlyTerminationNoticeDays());
        if (r.getEarlyTerminationForfeitPercent() != null) p.setEarlyTerminationForfeitPercent(r.getEarlyTerminationForfeitPercent());
        repository.save(p);
        return get();
    }

    /** Tỉ lệ tiền cọc được hoàn khi hủy sau {@code days} ngày giữ kho. */
    public BigDecimal refundRatio(long days) {
        PolicyResponse p = get();
        if (days < p.getFullRefundDays()) {
            return BigDecimal.ONE;
        }
        if (days < p.getDailyDeductUntilDays()) {
            return BigDecimal.ONE.subtract(BigDecimal.valueOf(days)
                    .divide(BigDecimal.valueOf(p.getForfeitDays()), 4, RoundingMode.HALF_UP)).max(BigDecimal.ZERO);
        }
        if (days < p.getForfeitDays()) {
            return BigDecimal.valueOf(p.getLateRefundPercent()).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }

    private static int pick(Integer v, int def) {
        return v != null ? v : def;
    }
}

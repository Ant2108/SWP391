package com.example.storage_api.config;

import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * Chuẩn hóa dữ liệu mẫu cũ không khớp bảng giá thật.
 *
 * Dữ liệu demo trước đây dùng số tiền ảo (100đ, 300đ...) và thuê 3 tháng, lệch với bảng giá và quy tắc hiện nay
 * (đặt 1 hoặc 2 tháng, cọc 50% tổng tiền thuê). Mỗi lần khởi động, các bản ghi có số tiền thuê dưới 10.000đ
 * (chắc chắn là dữ liệu ảo, giá thật luôn cao hơn nhiều) được đưa về 1.000.000đ/tháng và tối đa 2 tháng.
 * Chỉ sửa số liệu tại chỗ, không xóa bản ghi nào nên các lịch hẹn, hỗ trợ, biên bản liên quan vẫn nguyên vẹn.
 * Chạy lại nhiều lần vẫn an toàn (bản ghi đã chuẩn hóa không còn dưới ngưỡng).
 */
@Slf4j
@Profile("!test")
@Component
@RequiredArgsConstructor
public class DemoDataNormalizer {
    static final BigDecimal DEMO_MONTHLY = BigDecimal.valueOf(1_000_000);
    private static final BigDecimal FAKE_BELOW = BigDecimal.valueOf(10_000);

    private final ReservationRepository reservationRepository;
    private final RentalContractRepository contractRepository;
    private final PaymentRepository paymentRepository;

    @Order(10)
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void normalize() {
        int reservations = 0;
        int contracts = 0;
        int payments = 0;

        for (Reservation r : reservationRepository.findAll()) {
            boolean fake = r.getEstimatedAmount() != null && r.getEstimatedAmount().compareTo(FAKE_BELOW) < 0;
            boolean tooLong = r.getRentalMonths() != null && r.getRentalMonths() > 2 && fake;
            if (fake || tooLong) {
                int months = Math.min(r.getRentalMonths() == null ? 1 : r.getRentalMonths(), 2);
                r.setRentalMonths(months);
                r.setEstimatedAmount(DEMO_MONTHLY.multiply(BigDecimal.valueOf(months)));
                reservationRepository.save(r);
                reservations++;
            }
        }

        for (RentalContract c : contractRepository.findAll()) {
            if (c.getMonthlyPrice() != null && c.getMonthlyPrice().compareTo(FAKE_BELOW) < 0) {
                int months = c.getReservation() != null && c.getReservation().getRentalMonths() != null
                        ? c.getReservation().getRentalMonths() : 1;
                c.setMonthlyPrice(DEMO_MONTHLY);
                c.setDepositAmount(DEMO_MONTHLY.multiply(BigDecimal.valueOf(months)).divide(BigDecimal.valueOf(2)));
                if (c.getStartDate() != null) {
                    c.setEndDate(c.getStartDate().plusMonths(months).minusDays(1));
                }
                contractRepository.save(c);
                contracts++;
            }
        }

        for (Payment p : paymentRepository.findAll()) {
            if (p.getAmount() == null || p.getAmount().compareTo(FAKE_BELOW) >= 0 || p.getReservation() == null
                    || p.getReservation().getEstimatedAmount() == null) {
                continue;
            }
            BigDecimal total = p.getReservation().getEstimatedAmount();
            if (p.getPaymentType() == PaymentType.DEPOSIT) {
                p.setAmount(total.divide(BigDecimal.valueOf(2)));
            } else if (p.getPaymentType() == PaymentType.RENTAL) {
                p.setAmount(total);
            } else {
                continue;
            }
            paymentRepository.save(p);
            payments++;
        }

        if (reservations + contracts + payments > 0) {
            log.info("DemoDataNormalizer: chuẩn hóa dữ liệu mẫu cũ ({} đơn, {} hợp đồng, {} khoản thu) về giá 1.000.000đ/tháng, tối đa 2 tháng.",
                    reservations, contracts, payments);
        }
    }
}

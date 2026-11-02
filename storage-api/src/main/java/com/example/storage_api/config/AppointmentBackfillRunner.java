package com.example.storage_api.config;

import com.example.storage_api.service.AppointmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Mỗi đơn đặt kho còn hiệu lực cần có một lịch nhận kho. Đơn tạo trước khi có quy tắc này
 * được bổ sung một lần khi khởi động; chạy lại nhiều lần vẫn an toàn (không sinh trùng).
 */
@Slf4j
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class AppointmentBackfillRunner implements ApplicationRunner {

    private final AppointmentService appointmentService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int created = appointmentService.backfillAll();
            if (created > 0) {
                log.info("Backfilled {} check-in appointment(s) for existing reservations", created);
            }
        } catch (RuntimeException e) {
            log.warn("Could not backfill check-in appointments: {}", e.getMessage());
        }
    }
}

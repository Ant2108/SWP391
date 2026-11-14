package com.example.storage_api.config;

import com.example.storage_api.service.ReminderService;
import com.example.storage_api.service.ReservationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDateTime;

/**
 * Chạy ReminderService định kỳ (15 phút một lần, lần đầu sau 1 phút khi khởi động).
 * Tắt bằng app.reminders.enabled=false (test dùng cấu hình này). Lỗi một lần chạy chỉ ghi log, lần sau chạy lại.
 */
@Slf4j
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.reminders.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class ReminderScheduler {

    private final ReminderService reminderService;
    private final ReservationService reservationService;
    private final com.example.storage_api.service.AccountGuardService accountGuard;
    private final com.example.storage_api.service.Stage2PaymentService stage2PaymentService;

    @Scheduled(initialDelayString = "${app.reminders.initial-delay-ms:60000}", fixedDelayString = "${app.reminders.interval-ms:900000}")
    public void run() {
        // Hủy đơn quá 24 giờ chưa trả cọc ở mọi cơ sở (kể cả khi không có ai đặt kho mới).
        try {
            int expired = reservationService.expireAllUnpaidReservations();
            if (expired > 0) {
                log.info("ReminderScheduler: cancelled {} unpaid reservation(s) after 24 h", expired);
            }
        } catch (RuntimeException e) {
            log.warn("ReminderScheduler: expiry failed: {}", e.getMessage());
        }
        try {
            int unlocked = accountGuard.unlockExpired(LocalDateTime.now());
            if (unlocked > 0) {
                log.info("ReminderScheduler: unlocked {} account(s) after the 24 h lock", unlocked);
            }
        } catch (RuntimeException e) {
            log.warn("ReminderScheduler: unlock failed: {}", e.getMessage());
        }
        try {
            int changed = stage2PaymentService.process(java.time.LocalDate.now());
            if (changed > 0) {
                log.info("ReminderScheduler: stage-2 payment follow-up made {} change(s)", changed);
            }
        } catch (RuntimeException e) {
            log.warn("ReminderScheduler: stage-2 follow-up failed: {}", e.getMessage());
        }
        try {
            int sent = reminderService.sendReminders(LocalDateTime.now());
            if (sent > 0) {
                log.info("ReminderScheduler: sent {} reminder(s)", sent);
            }
        } catch (RuntimeException e) {
            log.warn("ReminderScheduler: run failed: {}", e.getMessage());
        }
    }
}

package com.example.storage_api.service;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.UsersRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.io.UnsupportedEncodingException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Email thông báo cho module Appointment / Return / Support (đặt lịch, gán staff, hủy/đổi lịch, no-show,
 * support RESOLVED, phí hư hại...).
 *
 * Nguyên tắc: gửi SAU KHI transaction commit, chạy ở thread riêng, và nuốt mọi lỗi (chỉ log) — lỗi SMTP
 * không bao giờ được làm hỏng nghiệp vụ. Tắt hẳn bằng app.notifications.enabled=false (dùng trong test).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OperationsNotificationService {

    private static final String BRAND = "SafeSpace Storage";

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;
    private final NotificationService notifications;
    private final UsersRepository usersRepository;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${spring.mail.username}")
    private String from;

    @Value("${app.notifications.enabled:true}")
    private boolean enabled;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ops-mail");
        t.setDaemon(true);
        return t;
    });

    /**
     * @param path đường dẫn FE để nút "View details" mở tới (vd /account/appointments), null = không có nút.
     */
    public void notifyUser(Users user, String subject, String heading, String message, String path) {
        notifyUserOnce(null, user, subject, heading, message, path);
    }

    /**
     * Như notifyUser nhưng chỉ gửi MỘT lần cho mỗi dedupeKey (thông báo nhắc tự động chạy theo lịch).
     * @return true nếu đã gửi, false nếu khóa này đã gửi trước đó.
     */
    public boolean notifyUserOnce(String dedupeKey, Users user, String subject, String heading, String message, String path) {
        if (user == null) {
            return false;
        }
        if (dedupeKey != null && notifications.alreadySent(user, dedupeKey)) {
            return false;
        }
        // Chuông trong app luôn được tạo (không phụ thuộc cấu hình email); lỗi ở đây không được làm hỏng nghiệp vụ.
        try {
            notifications.create(user, heading, message, path, dedupeKey);
        } catch (RuntimeException e) {
            log.warn("Could not create in-app notification for user {}: {}", user.getId(), e.getMessage());
        }
        if (!enabled || user.getEmail() == null) {
            return true;
        }
        // Lấy dữ liệu ra khỏi entity ngay (entity có thể lazy / ngoài session ở thread khác).
        String email = user.getEmail();
        String name = user.getFullname();
        Runnable task = () -> sendQuietly(email, name, subject, heading, message, path);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(task);
                }
            });
        } else {
            executor.execute(task);
        }
        return true;
    }

    /** Thông báo cho tất cả Facility Manager đang hoạt động của một cơ sở (vd có đơn đặt kho mới cần duyệt). */
    public void notifyFacilityManagers(Long facilityId, String subject, String heading, String message, String path) {
        usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_MANAGER, facilityId, Status.ACTIVE)
                .forEach(m -> notifyUser(m, subject, heading, message, path));
    }

    /** Chỉ gửi email (không có chuông), cho người chưa có tài khoản, vd trả lời câu hỏi của khách vãng lai. */
    public void emailAddress(String email, String name, String subject, String heading, String message) {
        if (!enabled || email == null || email.isBlank()) {
            return;
        }
        Runnable task = () -> sendQuietly(email, name, subject, heading, message, null);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(task);
                }
            });
        } else {
            executor.execute(task);
        }
    }

    private void sendQuietly(String to, String name, String subject, String heading, String message, String path) {
        try {
            Map<String, Object> vars = new HashMap<>();
            vars.put("name", name);
            vars.put("heading", heading);
            vars.put("message", message);
            vars.put("link", path == null ? null : frontendUrl + path);
            vars.put("linkLabel", "View details");
            vars.put("subject", subject);
            vars.put("frontendUrl", frontendUrl);
            Context context = new Context();
            context.setVariables(vars);
            String html = templateEngine.process("mail/notification", context);

            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false, "UTF-8");
            helper.setFrom(from, BRAND);
            helper.setTo(to);
            helper.setSubject(subject + " – " + BRAND);
            helper.setText(html, true);
            mailSender.send(mime);
        } catch (MessagingException | UnsupportedEncodingException | RuntimeException e) {
            log.warn("Could not send notification email to {}: {}", to, e.getMessage());
        }
    }
}

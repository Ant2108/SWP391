package com.example.storage_api.service;

import com.example.storage_api.entity.Users;
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
        if (!enabled || user == null || user.getEmail() == null) {
            return;
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

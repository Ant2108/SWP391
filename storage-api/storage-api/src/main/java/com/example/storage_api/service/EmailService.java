package com.example.storage_api.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.io.UnsupportedEncodingException;
import java.util.Map;

/**
 * Gửi email HTML render từ template Thymeleaf trong resources/templates/mail
 * (dùng chung layout mail/layout.html cho đồng bộ giao diện với web).
 */
@Service
@RequiredArgsConstructor
public class EmailService {

    public static final int RESET_PASSWORD_EXPIRY_MINUTES = 15;
    public static final int EMAIL_CHANGE_EXPIRY_MINUTES = 30;

    private static final String BRAND = "SafeSpace Storage";

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${spring.mail.username}")
    private String from;

    public void sendResetPasswordEmail(String email, String fullname, String resetToken) {
        send(email, "Reset your password", "mail/reset-password", Map.of(
                "name", fullname,
                "link", frontendUrl + "/reset-password?token=" + resetToken,
                "expiryMinutes", RESET_PASSWORD_EXPIRY_MINUTES
        ));
    }

    /** Gửi tới email HIỆN TẠI: chủ tài khoản xác nhận thì mới đổi sang newEmail. */
    public void sendEmailChangeConfirmation(String currentEmail, String fullname, String newEmail, String token) {
        send(currentEmail, "Confirm your email change", "mail/change-email", Map.of(
                "name", fullname,
                "currentEmail", currentEmail,
                "newEmail", newEmail,
                "link", frontendUrl + "/confirm-email?token=" + token,
                "expiryMinutes", EMAIL_CHANGE_EXPIRY_MINUTES
        ));
    }

    private void send(String to, String subject, String template, Map<String, Object> variables) {
        Context context = new Context();
        context.setVariables(variables);
        context.setVariable("subject", subject);
        context.setVariable("frontendUrl", frontendUrl);
        String html = templateEngine.process(template, context);

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(from, BRAND);
            helper.setTo(to);
            helper.setSubject(subject + " – " + BRAND);
            helper.setText(html, true);
            mailSender.send(message);
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new IllegalStateException("Cannot build email: " + e.getMessage(), e);
        }
    }
}

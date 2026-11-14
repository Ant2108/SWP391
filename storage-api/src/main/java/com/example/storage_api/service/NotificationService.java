package com.example.storage_api.service;

import com.example.storage_api.entity.Notification;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.NotificationResponse;
import com.example.storage_api.reponsitory.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Thông báo trong app (chuông). Việc tạo thông báo chạy trong cùng transaction với nghiệp vụ gây ra nó,
 * nên nếu nghiệp vụ bị rollback thì thông báo cũng không còn.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final int TITLE_MAX = 200;
    private static final int MESSAGE_MAX = 1000;
    private static final int LINK_MAX = 200;

    private final NotificationRepository notificationRepository;
    private final CurrentUserService currentUser;

    @Transactional
    public void create(Users user, String title, String message, String link) {
        create(user, title, message, link, null);
    }

    /** Đã gửi thông báo nhắc có khóa này cho người dùng chưa (chống nhắc trùng khi job chạy nhiều lần). */
    @Transactional(readOnly = true)
    public boolean alreadySent(Users user, String dedupeKey) {
        return user != null && user.getId() != null && dedupeKey != null
                && notificationRepository.existsByUser_IdAndDedupeKey(user.getId(), dedupeKey);
    }

    @Transactional
    public void create(Users user, String title, String message, String link, String dedupeKey) {
        if (user == null || user.getId() == null || title == null || title.isBlank()) {
            return;
        }
        Notification n = new Notification();
        n.setDedupeKey(trim(dedupeKey, 100));
        n.setUser(user);
        n.setTitle(trim(title, TITLE_MAX));
        n.setMessage(trim(message, MESSAGE_MAX));
        n.setLink(trim(link, LINK_MAX));
        notificationRepository.save(n);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> mine() {
        Users caller = currentUser.get();
        return notificationRepository.findTop50ByUser_IdOrderByCreatedAtDescIdDesc(caller.getId()).stream()
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount() {
        return notificationRepository.countByUser_IdAndReadFalse(currentUser.get().getId());
    }

    @Transactional
    public NotificationResponse markRead(Integer id) {
        Users caller = currentUser.get();
        Notification n = notificationRepository.findByIdAndUser_Id(id, caller.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy thông báo: " + id));
        n.setRead(true);
        return toResponse(notificationRepository.save(n));
    }

    @Transactional
    public int markAllRead() {
        return notificationRepository.markAllRead(currentUser.get().getId());
    }

    private NotificationResponse toResponse(Notification n) {
        return NotificationResponse.builder()
                .id(n.getId()).title(n.getTitle()).message(n.getMessage()).link(n.getLink())
                .read(n.isRead()).createdAt(n.getCreatedAt())
                .build();
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}

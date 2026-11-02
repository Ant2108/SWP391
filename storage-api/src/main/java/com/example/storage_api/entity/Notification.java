package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

/**
 * Thông báo trong app (chuông ở thanh menu): mỗi dòng là một thông báo gửi cho một người dùng.
 * Được tạo cùng lúc với email thông báo, và khi đơn đặt kho / thanh toán chuyển sang bước mới.
 */
@Entity
@Table(name = "Notifications")
@Getter
@Setter
@NoArgsConstructor
public class Notification extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "NotificationId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "UserId", nullable = false)
    private Users user;

    @Nationalized
    @Column(name = "Title", nullable = false, length = 200)
    private String title;

    @Nationalized
    @Column(name = "Message", length = 1000)
    private String message;

    /** Đường dẫn trên FE mở ra khi bấm vào thông báo (vd /account/reservations/5), có thể null. */
    @Column(name = "Link", length = 200)
    private String link;

    @Column(name = "IsRead", nullable = false)
    private boolean read = false;

    /** Khóa chống gửi trùng cho thông báo nhắc tự động (vd deposit-6h-12); null với thông báo thường. */
    @Column(name = "DedupeKey", length = 100)
    private String dedupeKey;
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Yêu cầu đổi email đang chờ xác nhận: email chỉ được cập nhật
 * khi user bấm link gửi tới địa chỉ mới.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EmailChangeToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String token;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private Users user;

    @Column(nullable = false, length = 150)
    private String newEmail;

    @Column(nullable = false)
    private LocalDateTime expiryDate;

    @Column(nullable = false)
    private boolean used = false;
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import java.util.Collection;
import java.util.List;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "Users")
public class Users implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "UserId")
    private Long id;

    @Column(name = "FullName", nullable = false, columnDefinition = "NVARCHAR(150)")
    private String fullname;

    @Column(name = "Email", nullable = false, unique = true, length = 150)
    private String email;

    @Column(name = "Phone", length = 20)
    private String phone;

    @Column(name = "PasswordHash", nullable = false, length = 255)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(name = "Role", nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false)
    private Status status = Status.ACTIVE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "FacilityId")
    private Facility facility;

    // ---- Chống đặt kho không thanh toán liên tiếp (Integer để thêm cột được trên dữ liệu cũ) ----
    // Số đơn liên tiếp bị tự hủy do không đóng cọc; về 0 khi khách đóng cọc thành công.
    @Column(name = "UnpaidStreak")
    private Integer unpaidStreak;

    // Số lần tài khoản đã bị khóa vì vi phạm: lần 1 khóa 24 giờ, lần 2 khóa vĩnh viễn (admin mở khóa được).
    @Column(name = "AbuseLockCount")
    private Integer abuseLockCount;

    // Thời điểm tự mở khóa (null nếu không khóa tạm).
    @Column(name = "LockedUntil")
    private LocalDateTime lockedUntil;

    @Column(name = "CreatedAt", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "UpdatedAt")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    protected void onCreate() {
        if (createdAt == null)
            createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(
                new SimpleGrantedAuthority(
                        "ROLE_" + role.name()));
    }

    @Override
    public String getUsername() {
        return email;
    }

}
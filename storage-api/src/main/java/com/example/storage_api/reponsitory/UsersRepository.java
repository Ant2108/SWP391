package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.PasswordResetToken;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UsersRepository extends JpaRepository<Users, Long> {
    Optional<Users> findByEmail(String email);

    Optional<Users> findByEmailIgnoreCase(String email);
    boolean existsByEmail(String email);

    // Module Appointment/Support: tìm manager (hoặc staff) đang hoạt động của một cơ sở để gửi thông báo.
    List<Users> findByRoleAndStatus(Role role, Status status);

    List<Users> findByRoleAndFacility_IdAndStatus(Role role, Long facilityId, Status status);

    // Tài khoản bị khóa tạm đã đến giờ tự mở khóa.
    List<Users> findByLockedUntilLessThanEqualAndStatus(java.time.LocalDateTime time, Status status);
}

package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.PasswordResetToken;
import com.example.storage_api.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(String token);

    void deleteByUser(Users user);

    void deleteByToken(String token);
}
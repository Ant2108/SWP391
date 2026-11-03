package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.EmailChangeToken;
import com.example.storage_api.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmailChangeTokenRepository extends JpaRepository<EmailChangeToken, Long> {

    Optional<EmailChangeToken> findByToken(String token);

    void deleteByUser(Users user);
}

package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Integer> {

    List<Notification> findTop50ByUser_IdOrderByCreatedAtDescIdDesc(Long userId);

    long countByUser_IdAndReadFalse(Long userId);

    boolean existsByUser_IdAndDedupeKey(Long userId, String dedupeKey);

    Optional<Notification> findByIdAndUser_Id(Integer id, Long userId);

    @Modifying(clearAutomatically = true)
    @Query("update Notification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllRead(@Param("userId") Long userId);
}

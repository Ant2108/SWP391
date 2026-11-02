package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportRequest;
import com.example.storage_api.entity.SupportStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupportRequestRepository extends JpaRepository<SupportRequest, Integer> {

    // Lọc tuỳ chọn theo cơ sở / trạng thái / mức ưu tiên / staff được gán (null = không lọc).
    @Query("""
            select r from SupportRequest r
            join fetch r.customer c
            join fetch r.facility f
            join fetch r.storageUnit u
            left join fetch r.assignedStaff s
            where (:facilityId is null or f.id = :facilityId)
              and (:status is null or r.status = :status)
              and (:priority is null or r.priority = :priority)
              and (:staffId is null or s.id = :staffId)
            order by r.createdAt desc
            """)
    List<SupportRequest> search(@Param("facilityId") Long facilityId,
                                @Param("status") SupportStatus status,
                                @Param("priority") SupportPriority priority,
                                @Param("staffId") Long staffId);

    List<SupportRequest> findByCustomer_IdOrderByCreatedAtDesc(Long customerId);
}

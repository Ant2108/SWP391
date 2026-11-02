package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Inquiry;
import com.example.storage_api.entity.InquiryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InquiryRepository extends JpaRepository<Inquiry, Integer> {

    // Lọc tuỳ chọn (null = không lọc); mới nhất trước.
    @Query("""
            select i from Inquiry i
            join fetch i.facility f
            left join fetch i.answeredBy
            where (:facilityId is null or f.id = :facilityId)
              and (:status is null or i.status = :status)
            order by i.createdAt desc, i.id desc
            """)
    List<Inquiry> search(@Param("facilityId") Long facilityId, @Param("status") InquiryStatus status);
}

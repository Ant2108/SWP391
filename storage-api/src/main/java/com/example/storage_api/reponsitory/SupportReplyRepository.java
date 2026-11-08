package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.SupportReply;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupportReplyRepository extends JpaRepository<SupportReply, Integer> {

    List<SupportReply> findBySupportRequest_IdOrderByCreatedAtAscIdAsc(Integer supportRequestId);
}

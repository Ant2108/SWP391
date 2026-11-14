package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.ContractProfile;
import com.example.storage_api.entity.ProfileStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContractProfileRepository extends JpaRepository<ContractProfile, Integer> {
    Optional<ContractProfile> findByReservation_Id(Integer reservationId);

    List<ContractProfile> findByCustomer_IdAndStatus(Long customerId, ProfileStatus status);

    List<ContractProfile> findByStatusOrderBySubmittedAtAsc(ProfileStatus status);
}

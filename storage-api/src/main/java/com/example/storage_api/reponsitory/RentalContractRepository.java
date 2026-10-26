package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.RentalContract;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface RentalContractRepository extends JpaRepository<RentalContract, Integer> {
    Optional<RentalContract> findByReservation_Id(Integer reservationId);

    List<RentalContract> findByCustomer_IdAndStatusIn(Long customerId, Collection<ContractStatus> statuses);

    List<RentalContract> findByCustomer_IdOrderByCreatedAtDesc(Long customerId);

    List<RentalContract> findByStorageUnit_Facility_IdOrderByCreatedAtDesc(Long facilityId);

    List<RentalContract> findByStorageUnit_Facility_IdAndStatusOrderByCreatedAtDesc(Long facilityId, ContractStatus status);

    List<RentalContract> findByStatusOrderByCreatedAtDesc(ContractStatus status);

    List<RentalContract> findAllByOrderByCreatedAtDesc();

    List<RentalContract> findByStatusAndEndDateBefore(ContractStatus status, LocalDate date);

    List<RentalContract> findByStatusAndEndDateLessThanEqual(ContractStatus status, LocalDate date);
}

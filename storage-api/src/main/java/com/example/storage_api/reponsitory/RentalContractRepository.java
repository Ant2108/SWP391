package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.RentalContract;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** TEMP – Member 3: repository tối thiểu cho entity tạm RentalContract. */
@Repository
public interface RentalContractRepository extends JpaRepository<RentalContract, Integer> {

    // Mỗi Reservation có tối đa một hợp đồng.
    Optional<RentalContract> findByReservation_Id(Integer reservationId);

    List<RentalContract> findByCustomer_IdAndStatusIn(Long customerId, Collection<ContractStatus> statuses);
}

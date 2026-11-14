package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.ContractTermination;
import com.example.storage_api.entity.TerminationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ContractTerminationRepository extends JpaRepository<ContractTermination, Integer> {

    /** Yêu cầu đang xử lý (REQUESTED hoặc INSPECTED) của một hợp đồng. */
    Optional<ContractTermination> findFirstByRentalContract_IdAndStatusInOrderByRequestedAtDesc(
            Integer contractId, Collection<TerminationStatus> statuses);

    /** Yêu cầu mới nhất của hợp đồng (mọi trạng thái). */
    Optional<ContractTermination> findFirstByRentalContract_IdOrderByRequestedAtDesc(Integer contractId);

    List<ContractTermination> findByCustomer_IdOrderByRequestedAtDesc(Long customerId);

    List<ContractTermination> findAllByOrderByRequestedAtDesc();

    List<ContractTermination> findByRentalContract_StorageUnit_Facility_IdOrderByRequestedAtDesc(Long facilityId);
}

package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.UnitReturn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UnitReturnRepository extends JpaRepository<UnitReturn, Integer> {

    // Một hợp đồng chỉ được trả một lần.
    boolean existsByRentalContract_Id(Integer contractId);
}

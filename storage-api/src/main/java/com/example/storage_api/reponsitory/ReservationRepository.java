package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/** TEMP – Member 3: repository tối thiểu cho entity tạm Reservation. */
@Repository
public interface ReservationRepository extends JpaRepository<Reservation, Integer> {

    List<Reservation> findByCustomer_IdAndStatus(Long customerId, ReservationStatus status);
}

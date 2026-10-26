package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReservationRepository extends JpaRepository<Reservation, Integer> {

    List<Reservation> findByCustomer_IdAndStatus(Long customerId, ReservationStatus status);

    List<Reservation> findByCustomer_IdOrderByCreatedAtDesc(Long customerId);

    List<Reservation> findByFacility_IdAndStatusOrderByCreatedAtDesc(Long facilityId, ReservationStatus status);

    List<Reservation> findByFacility_IdOrderByCreatedAtDesc(Long facilityId);

    List<Reservation> findByStatusOrderByCreatedAtDesc(ReservationStatus status);

    List<Reservation> findAllByOrderByCreatedAtDesc();

    @Query("select r from Reservation r where r.customer.id = :customerId and r.id = :id")
    Optional<Reservation> findCustomerReservation(@Param("customerId") Long customerId,
            @Param("id") Integer id);
}

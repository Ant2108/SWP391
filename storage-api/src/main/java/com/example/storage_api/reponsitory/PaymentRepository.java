package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Integer> {
    boolean existsByReservation_IdAndPaymentTypeAndStatus(Integer reservationId, PaymentType type,
            PaymentStatus status);

    boolean existsByRentalContract_IdAndPaymentTypeAndStatus(Integer rentalContractId, PaymentType type,
            PaymentStatus status);

    List<Payment> findByCustomer_IdOrderByCreatedAtDesc(Long customerId);

    List<Payment> findByReservation_IdOrderByCreatedAtDesc(Integer reservationId);

    List<Payment> findByRentalContract_IdOrderByCreatedAtDesc(Integer rentalContractId);

    List<Payment> findByStatusAndPaymentType(PaymentStatus status, PaymentType paymentType);

    List<Payment> findAllByOrderByCreatedAtDesc();

    Optional<Payment> findFirstByReservation_IdAndPaymentTypeOrderByCreatedAtDesc(
            Integer reservationId, PaymentType paymentType);

    Optional<Payment> findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
            Integer reservationId, PaymentType paymentType, PaymentStatus status);

    Optional<Payment> findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
            Integer rentalContractId, PaymentType paymentType, PaymentStatus status);
}

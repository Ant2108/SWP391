package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** TEMP – Member 3: repository tối thiểu cho entity tạm Payment. */
@Repository
public interface PaymentRepository extends JpaRepository<Payment, Integer> {

    // Dùng khi check-in: reservation đã có khoản cọc PAID chưa?
    boolean existsByReservation_IdAndPaymentTypeAndStatus(Integer reservationId, PaymentType type, PaymentStatus status);
}

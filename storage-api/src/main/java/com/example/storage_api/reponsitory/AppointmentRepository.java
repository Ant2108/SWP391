package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, Integer> {

    // Lọc tuỳ chọn (null = không lọc). from/to luôn có giá trị (Service truyền khoảng rộng khi không lọc ngày)
    // để tránh lỗi kiểu tham số null của SQL Server. noShowOnly=true: chỉ lịch staff đã báo khách vắng
    // (Notes bắt đầu bằng "NO-SHOW REPORT"), manager dùng để xử lý.
    @Query("""
            select a from Appointment a
            join fetch a.customer c
            join fetch a.facility f
            left join fetch a.staff s
            where (:facilityId is null or f.id = :facilityId)
              and (:type is null or a.appointmentType = :type)
              and (:status is null or a.status = :status)
              and (:staffId is null or s.id = :staffId)
              and a.scheduledAt >= :from and a.scheduledAt < :to
              and (:noShowOnly = false or a.notes like 'NO-SHOW REPORT%')
            order by a.scheduledAt
            """)
    List<Appointment> search(@Param("facilityId") Long facilityId,
                             @Param("type") AppointmentType type,
                             @Param("status") AppointmentStatus status,
                             @Param("staffId") Long staffId,
                             @Param("from") LocalDateTime from,
                             @Param("to") LocalDateTime to,
                             @Param("noShowOnly") boolean noShowOnly);

    List<Appointment> findByCustomer_IdOrderByScheduledAtDesc(Long customerId);

    // Chống trùng: một Reservation chỉ có 1 lịch CHECK_IN đang SCHEDULED.
    boolean existsByReservation_IdAndAppointmentTypeAndStatus(Integer reservationId, AppointmentType type,
                                                              AppointmentStatus status);

    // Chống trùng: một hợp đồng chỉ có 1 lịch RETURN (hoặc SUPPORT) đang SCHEDULED.
    boolean existsByRentalContract_IdAndAppointmentTypeAndStatus(Integer contractId, AppointmentType type,
                                                                 AppointmentStatus status);

    // Khi trả kho: tìm lịch RETURN đang chờ của hợp đồng để đóng lại.
    List<Appointment> findByRentalContract_IdAndAppointmentTypeAndStatus(Integer contractId, AppointmentType type,
                                                                         AppointmentStatus status);
}

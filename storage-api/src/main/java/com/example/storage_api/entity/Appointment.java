package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

/**
 * Lịch hẹn tại cơ sở: CHECK_IN (nhận kho), RETURN (trả kho), SUPPORT (hỗ trợ tại chỗ).
 * Customer đặt (staff = null) -> Facility Manager gán staff -> Staff hoàn tất.
 */
@Entity
@Table(name = "Appointments")
@Getter
@Setter
@NoArgsConstructor
public class Appointment extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "AppointmentId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    // CHECK_IN luôn có reservation; RETURN / SUPPORT có rentalContract.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ReservationId")
    private Reservation reservation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "RentalContractId")
    private RentalContract rentalContract;

    // Staff được Manager gán (null lúc customer mới đặt).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "StaffId")
    private Users staff;

    @Enumerated(EnumType.STRING)
    @Column(name = "AppointmentType", nullable = false, length = 20)
    private AppointmentType appointmentType;

    @Column(name = "ScheduledAt", nullable = false)
    private LocalDateTime scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private AppointmentStatus status = AppointmentStatus.SCHEDULED;

    @Nationalized
    @Column(name = "Notes", length = 500)
    private String notes;
}

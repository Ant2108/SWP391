package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

/** Yêu cầu hỗ trợ của khách về kho, khóa, chìa, thanh toán, đồ lưu trữ... */
@Entity
@Table(name = "SupportRequests")
@Getter
@Setter
@NoArgsConstructor
public class SupportRequest extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "SupportRequestId")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "CustomerId", nullable = false)
    private Users customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "FacilityId", nullable = false)
    private Facility facility;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "RentalContractId", nullable = false)
    private RentalContract rentalContract;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "StorageUnitId", nullable = false)
    private StorageUnit storageUnit;

    // Staff được Manager gán.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "AssignedStaffId")
    private Users assignedStaff;

    @Enumerated(EnumType.STRING)
    @Column(name = "SupportType", nullable = false, length = 20)
    private SupportType supportType;

    @Nationalized
    @Column(name = "Title", nullable = false, length = 200)
    private String title;

    @Nationalized
    @Column(name = "Description", length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "Priority", nullable = false, length = 20)
    private SupportPriority priority = SupportPriority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false, length = 20)
    private SupportStatus status = SupportStatus.OPEN;

    @Column(name = "ResolvedAt")
    private LocalDateTime resolvedAt;
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "Facilities")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Facility {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "FacilityId")
    private Long id;

    @Column(name = "FacilityName", nullable = false, length = 150)
    private String name;

    @Column(name = "Address", nullable = false, length = 300)
    private String address;

    @Column(name = "Phone", length = 20)
    private String phone;

    @Column(name = "OpeningTime")
    private LocalTime openingTime;

    @Column(name = "ClosingTime")
    private LocalTime closingTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "Status", nullable = false)
    private FacilityStatus status = FacilityStatus.ACTIVE;

    @Column(name = "CreatedAt", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "UpdatedAt")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    protected void onCreate() {
        if (createdAt == null)
            createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

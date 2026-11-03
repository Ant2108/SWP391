package com.example.storage_api.controller;

import com.example.storage_api.entity.ReservationStatus;
import com.example.storage_api.model.reponse.ReservationResponse;
import com.example.storage_api.model.request.AssignUnitRequest;
import com.example.storage_api.model.request.ReservationCreateRequest;
import com.example.storage_api.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {
    private final ReservationService reservationService;

    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    public ResponseEntity<ReservationResponse> create(@Valid @RequestBody ReservationCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.create(request));
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<ReservationResponse> mine() {
        return reservationService.mine();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public ReservationResponse get(@PathVariable Integer id) {
        return reservationService.get(id);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<ReservationResponse> list(@RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) ReservationStatus status) {
        return reservationService.list(facilityId, status);
    }

    @PatchMapping("/{id}/assign-unit")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER')")
    public ReservationResponse assign(@PathVariable Integer id, @Valid @RequestBody AssignUnitRequest request) {
        return reservationService.assignUnit(id, request.getStorageUnitId());
    }

    @PatchMapping("/{id}/confirm")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER')")
    public ReservationResponse confirm(@PathVariable Integer id) {
        return reservationService.confirm(id);
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_MANAGER')")
    public ReservationResponse cancel(@PathVariable Integer id) {
        return reservationService.cancel(id);
    }
}

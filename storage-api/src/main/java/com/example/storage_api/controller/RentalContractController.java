package com.example.storage_api.controller;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.model.reponse.RentalContractResponse;
import com.example.storage_api.model.request.RenewalRequest;
import com.example.storage_api.service.RentalContractService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rental-contracts")
@RequiredArgsConstructor
public class RentalContractController {
    private final RentalContractService contractService;

    @PostMapping("/from-reservation/{reservationId}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','CUSTOMER')")
    public ResponseEntity<RentalContractResponse> create(@PathVariable Integer reservationId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(contractService.create(reservationId));
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<RentalContractResponse> mine() {
        return contractService.mine();
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<RentalContractResponse> list(
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) ContractStatus status) {
        return contractService.list(facilityId, status);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public RentalContractResponse get(@PathVariable Integer id) {
        return contractService.get(id);
    }

    @PostMapping("/{id}/renew")
    @PreAuthorize("hasRole('CUSTOMER')")
    public RentalContractResponse renew(@PathVariable Integer id, @Valid @RequestBody RenewalRequest request) {
        return contractService.renew(id, request);
    }

    @PatchMapping("/{id}/overdue")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public RentalContractResponse markContractOverdue(@PathVariable Integer id) {
        return contractService.markSingleOverdue(id);
    }

    @PostMapping("/overdue/process")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER')")
    public int processOverdue() {
        return contractService.markOverdue();
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public RentalContractResponse activate(@PathVariable Integer id) {
        return contractService.activateContract(id);
    }

    @PatchMapping("/{id}/complete")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public RentalContractResponse complete(@PathVariable Integer id) {
        return contractService.completeContract(id);
    }
}

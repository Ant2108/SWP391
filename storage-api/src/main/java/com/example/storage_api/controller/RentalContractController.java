package com.example.storage_api.controller;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.model.reponse.RentalContractResponse;
import com.example.storage_api.model.request.ContractSignRequest;
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

    @PostMapping("/{id}/sign")
    @PreAuthorize("hasRole('CUSTOMER')")
    public RentalContractResponse sign(@PathVariable Integer id, @Valid @RequestBody ContractSignRequest request) {
        return contractService.signContract(id, request);
    }

    @PostMapping("/{id}/sign-at-counter")
    @PreAuthorize("hasAnyRole('FACILITY_STAFF','FACILITY_MANAGER')")
    public RentalContractResponse signAtCounter(@PathVariable Integer id, @Valid @RequestBody ContractSignRequest request) {
        return contractService.signAtCounter(id, request);
    }

    // Khách ký điện tử trước khi quản lý gán ô kho (chưa có hợp đồng) và rút lại chữ ký đó.
    @PostMapping("/reservation/{reservationId}/pre-sign")
    @PreAuthorize("hasRole('CUSTOMER')")
    public void preSign(@PathVariable Integer reservationId, @Valid @RequestBody ContractSignRequest request) {
        contractService.preSign(reservationId, request);
    }

    @DeleteMapping("/reservation/{reservationId}/pre-sign")
    @PreAuthorize("hasRole('CUSTOMER')")
    public void withdrawPreSign(@PathVariable Integer reservationId) {
        contractService.withdrawPreSign(reservationId);
    }

    // Ảnh hợp đồng giấy ký tại chỗ: nhân viên/quản lý tải lên, quản lý duyệt.
    @PostMapping("/reservation/{reservationId}/signed-scan")
    @PreAuthorize("hasAnyRole('FACILITY_STAFF','FACILITY_MANAGER')")
    public void uploadPreScan(@PathVariable Integer reservationId, @RequestBody java.util.Map<String, String> body) {
        contractService.uploadPreScan(reservationId, body.get("url"));
    }

    @PatchMapping("/reservation/{reservationId}/signed-scan/approve")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public void approvePreScan(@PathVariable Integer reservationId) {
        contractService.reviewPreScan(reservationId, true, null);
    }

    @PatchMapping("/reservation/{reservationId}/signed-scan/reject")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public void rejectPreScan(@PathVariable Integer reservationId, @RequestBody java.util.Map<String, String> body) {
        contractService.reviewPreScan(reservationId, false, body.get("reason"));
    }

    @PostMapping("/{id}/signed-scan")
    @PreAuthorize("hasAnyRole('FACILITY_STAFF','FACILITY_MANAGER')")
    public RentalContractResponse uploadSignedScan(@PathVariable Integer id, @RequestBody java.util.Map<String, String> body) {
        return contractService.uploadSignedScan(id, body.get("url"));
    }

    @PatchMapping("/{id}/signed-scan/approve")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public RentalContractResponse approveSignedScan(@PathVariable Integer id) {
        return contractService.reviewSignedScan(id, true, null);
    }

    @PatchMapping("/{id}/signed-scan/reject")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public RentalContractResponse rejectSignedScan(@PathVariable Integer id, @RequestBody java.util.Map<String, String> body) {
        return contractService.reviewSignedScan(id, false, body.get("reason"));
    }

    @GetMapping("/{id}/renewal-quote")
    @PreAuthorize("hasRole('CUSTOMER')")
    public com.example.storage_api.model.reponse.RenewalQuoteResponse renewalQuote(@PathVariable Integer id,
            @RequestParam(required = false) Integer months) {
        return contractService.renewalQuote(id, months);
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

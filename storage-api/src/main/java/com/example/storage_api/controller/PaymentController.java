package com.example.storage_api.controller;

import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.model.reponse.PaymentResponse;
import com.example.storage_api.model.request.PaymentCreateRequest;
import com.example.storage_api.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {
    private final PaymentService paymentService;

    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<PaymentResponse> list(
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) PaymentType paymentType) {
        return paymentService.list(facilityId, status, paymentType);
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<PaymentResponse> mine() {
        return paymentService.mine();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public PaymentResponse get(@PathVariable Integer id) {
        return paymentService.get(id);
    }

    @GetMapping("/contract/{contractId}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<PaymentResponse> listForContract(@PathVariable Integer contractId) {
        return paymentService.listForContract(contractId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public ResponseEntity<PaymentResponse> create(@Valid @RequestBody PaymentCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(paymentService.create(request));
    }

    @PatchMapping("/{id}/paid")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public PaymentResponse markPaid(@PathVariable Integer id,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String transactionReference) {
        return paymentService.markPaid(id, paymentMethod, transactionReference);
    }
}

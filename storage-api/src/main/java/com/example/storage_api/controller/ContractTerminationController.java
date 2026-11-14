package com.example.storage_api.controller;

import com.example.storage_api.entity.TerminationStatus;
import com.example.storage_api.model.reponse.TerminationQuoteResponse;
import com.example.storage_api.model.reponse.TerminationResponse;
import com.example.storage_api.model.request.TerminationRejectRequest;
import com.example.storage_api.model.request.TerminationRequest;
import com.example.storage_api.service.ContractTerminationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Hủy hợp đồng sớm: khách yêu cầu, quản lý xử lý (liên hệ, cử nhân viên kiểm tra kho, xác nhận hoặc từ chối). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ContractTerminationController {

    private final ContractTerminationService service;

    // Luật và số tiền ước tính để khách xem trước khi đồng ý.
    @GetMapping("/rental-contracts/{id}/termination-quote")
    @PreAuthorize("hasRole('CUSTOMER')")
    public TerminationQuoteResponse quote(@PathVariable Integer id) {
        return service.quote(id);
    }

    @PostMapping("/rental-contracts/{id}/termination-request")
    @PreAuthorize("hasRole('CUSTOMER')")
    public ResponseEntity<TerminationResponse> request(@PathVariable Integer id, @Valid @RequestBody TerminationRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.request(id, body));
    }

    @PostMapping("/terminations/{id}/withdraw")
    @PreAuthorize("hasRole('CUSTOMER')")
    public TerminationResponse withdraw(@PathVariable Integer id) {
        return service.withdraw(id);
    }

    @GetMapping("/terminations/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<TerminationResponse> my() {
        return service.my();
    }

    @GetMapping("/terminations")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public List<TerminationResponse> list(@RequestParam(required = false) TerminationStatus status) {
        return service.list(status);
    }

    @GetMapping("/terminations/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_MANAGER','FACILITY_STAFF')")
    public TerminationResponse get(@PathVariable Integer id) {
        return service.get(id);
    }

    @PostMapping("/terminations/{id}/reject")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public TerminationResponse reject(@PathVariable Integer id, @Valid @RequestBody TerminationRejectRequest body) {
        return service.reject(id, body);
    }

    @PostMapping("/terminations/{id}/confirm")
    @PreAuthorize("hasRole('FACILITY_MANAGER')")
    public TerminationResponse confirm(@PathVariable Integer id) {
        return service.confirm(id);
    }
}

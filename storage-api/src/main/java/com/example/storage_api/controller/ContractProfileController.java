package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.ContractProfileResponse;
import com.example.storage_api.model.request.ContractProfileRejectRequest;
import com.example.storage_api.model.request.ContractProfileRequest;
import com.example.storage_api.service.ContractProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Hồ sơ thông tin hợp đồng của khách (theo đơn đặt kho). Ảnh CCCD chỉ xem được qua API có phân quyền. */
@RestController
@RequestMapping("/api/contract-profiles")
@RequiredArgsConstructor
public class ContractProfileController {
    private final ContractProfileService service;

    @GetMapping("/reservation/{reservationId}")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER','BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public ResponseEntity<ContractProfileResponse> get(@PathVariable Integer reservationId) {
        ContractProfileResponse r = service.get(reservationId);
        return r == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(r);
    }

    @GetMapping("/my/rejected")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<ContractProfileResponse> myRejected() {
        return service.myRejected();
    }

    @GetMapping("/pending-review")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public List<ContractProfileResponse> pendingReview() {
        return service.pendingReview();
    }

    @PostMapping("/reservation/{reservationId}/id-image")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER')")
    public ContractProfileResponse uploadIdImage(@PathVariable Integer reservationId,
            @RequestParam String side, @RequestParam("file") MultipartFile file) {
        return service.uploadIdImage(reservationId, side, file);
    }

    @GetMapping("/reservation/{reservationId}/id-image/{side}")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER','BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public ResponseEntity<Resource> idImage(@PathVariable Integer reservationId, @PathVariable String side) {
        Resource res = service.idImage(reservationId, side);
        String name = service.idImageName(reservationId, side);
        MediaType type = name != null && name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(type).cacheControl(CacheControl.noStore()).body(res);
    }

    @PutMapping("/reservation/{reservationId}")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER')")
    public ContractProfileResponse submit(@PathVariable Integer reservationId, @Valid @RequestBody ContractProfileRequest request) {
        return service.submit(reservationId, request);
    }

    @PutMapping("/reservation/{reservationId}/draft")
    @PreAuthorize("hasAnyRole('CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER')")
    public ContractProfileResponse saveDraft(@PathVariable Integer reservationId,
            @RequestBody com.example.storage_api.model.request.ContractProfileDraftRequest request) {
        return service.saveDraft(reservationId, request);
    }

    @PatchMapping("/reservation/{reservationId}/approve")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public ContractProfileResponse approve(@PathVariable Integer reservationId) {
        return service.approve(reservationId);
    }

    @PatchMapping("/reservation/{reservationId}/reject")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public ContractProfileResponse reject(@PathVariable Integer reservationId, @RequestBody ContractProfileRejectRequest request) {
        return service.reject(reservationId, request);
    }
}

package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.PolicyResponse;
import com.example.storage_api.model.request.PolicyRequest;
import com.example.storage_api.service.PolicyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** Chính sách chung. Ai cũng xem được (hiển thị cho khách khi đặt kho); chỉ Business Manager được sửa. */
@RestController
@RequestMapping("/api/policies")
@RequiredArgsConstructor
public class PolicyController {
    private final PolicyService policyService;

    @GetMapping
    public PolicyResponse get() {
        return policyService.get();
    }

    @PutMapping
    @PreAuthorize("hasRole('BUSINESS_MANAGER')")
    public PolicyResponse update(@Valid @RequestBody PolicyRequest request) {
        return policyService.update(request);
    }
}

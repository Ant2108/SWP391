package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.UnitReturnResponse;
import com.example.storage_api.model.request.UnitReturnRequest;
import com.example.storage_api.service.UnitReturnService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** API trả kho: staff kiểm tra unit và tạo biên bản trả (UnitReturn). */
@RestController
@RequestMapping("/api/unit-returns")
@RequiredArgsConstructor
public class UnitReturnController {

    private final UnitReturnService unitReturnService;

    // POST /api/unit-returns -> staff của cơ sở lập biên bản trả kho. Trả 201.
    @PostMapping
    @PreAuthorize("hasRole('FACILITY_STAFF')")
    public ResponseEntity<UnitReturnResponse> create(@Valid @RequestBody UnitReturnRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(unitReturnService.create(request));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public UnitReturnResponse get(@PathVariable Integer id) {
        return unitReturnService.get(id);
    }
}

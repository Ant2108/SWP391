package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.FacilityAssignmentResponse;
import com.example.storage_api.model.request.FacilityAssignmentRequest;
import com.example.storage_api.service.FacilityAssignmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/facility-assignments")
@RequiredArgsConstructor
public class FacilityAssignmentController {

    private final FacilityAssignmentService facilityAssignmentService;

    @GetMapping
    @PreAuthorize("hasRole('SYSTEM_ADMIN') or hasRole('FACILITY_MANAGER')")
    public ResponseEntity<List<FacilityAssignmentResponse>> listAssignments(
            @RequestParam(required = false) Long facilityId
    ) {
        return ResponseEntity.ok(facilityAssignmentService.getAssignmentsByFacility(facilityId));
    }

    @PostMapping
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<FacilityAssignmentResponse> createAssignment(
            @Valid @RequestBody FacilityAssignmentRequest request
    ) {
        return ResponseEntity.ok(facilityAssignmentService.assignUserToFacility(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<FacilityAssignmentResponse> updateAssignment(
            @PathVariable Long id,
            @Valid @RequestBody FacilityAssignmentRequest request
    ) {
        return ResponseEntity.ok(facilityAssignmentService.updateAssignment(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ResponseEntity<FacilityAssignmentResponse> deleteAssignment(@PathVariable Long id) {
        return ResponseEntity.ok(facilityAssignmentService.deactivateAssignment(id));
    }
}

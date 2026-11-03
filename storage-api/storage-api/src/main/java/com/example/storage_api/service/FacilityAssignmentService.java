package com.example.storage_api.service;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.model.reponse.FacilityAssignmentResponse;
import com.example.storage_api.model.request.FacilityAssignmentRequest;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FacilityAssignmentService {

    private final FacilityRepository facilityRepository;
    private final UsersRepository usersRepository;

    public List<FacilityAssignmentResponse> getAssignmentsByFacility(Long facilityId) {
        List<Users> assignedUsers;
        if (facilityId != null) {
            assignedUsers = usersRepository.findAll().stream()
                    .filter(u -> u.getFacility() != null && u.getFacility().getId().equals(facilityId))
                    .collect(Collectors.toList());
        } else {
            assignedUsers = usersRepository.findAll().stream()
                    .filter(u -> u.getFacility() != null)
                    .collect(Collectors.toList());
        }

        return assignedUsers.stream()
                .filter(u -> u.getStatus() == Status.ACTIVE)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public FacilityAssignmentResponse assignUserToFacility(FacilityAssignmentRequest request) {
        Users user = usersRepository.findById(request.getUserId())
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "User not found"));

        Facility facility = facilityRepository.findById(request.getFacilityId())
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Facility not found"));

        if (user.getRole() != Role.FACILITY_STAFF && user.getRole() != Role.FACILITY_MANAGER) {
            throw new AppException(HttpStatus.BAD_REQUEST, "User role must be FACILITY_STAFF or FACILITY_MANAGER");
        }

        user.setFacility(facility);
        return toResponse(usersRepository.save(user));
    }

    @Transactional
    public FacilityAssignmentResponse updateAssignment(Long id, FacilityAssignmentRequest request) {
        // Here `id` was originally the assignment ID.
        // Since there is no assignment entity, we will interpret `id` as the `userId` being reassigned.
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "User not found"));
        
        Facility facility = facilityRepository.findById(request.getFacilityId())
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "Facility not found"));

        if (user.getRole() != Role.FACILITY_STAFF && user.getRole() != Role.FACILITY_MANAGER) {
            throw new AppException(HttpStatus.BAD_REQUEST, "User role must be FACILITY_STAFF or FACILITY_MANAGER");
        }

        user.setFacility(facility);
        return toResponse(usersRepository.save(user));
    }

    @Transactional
    public FacilityAssignmentResponse deactivateAssignment(Long id) {
        // `id` interpreted as `userId`
        Users user = usersRepository.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "User not found"));
        user.setFacility(null);
        return toResponse(usersRepository.save(user));
    }

    private FacilityAssignmentResponse toResponse(Users user) {
        return FacilityAssignmentResponse.builder()
                .id(user.getId()) // Use userId as assignment id for API compatibility
                .userId(user.getId())
                .userFullname(user.getFullname())
                .userRole(user.getRole().name())
                .facilityId(user.getFacility() != null ? user.getFacility().getId() : null)
                .facilityName(user.getFacility() != null ? user.getFacility().getName() : null)
                .status("ACTIVE") // An assigned user to a facility means active assignment
                .build();
    }
}

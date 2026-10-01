package com.example.storage_api.model.reponse;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class FacilityAssignmentResponse {
    private Long id;
    private Long userId;
    private String userFullname;
    private String userRole;
    private Long facilityId;
    private String facilityName;
    private String status;
}

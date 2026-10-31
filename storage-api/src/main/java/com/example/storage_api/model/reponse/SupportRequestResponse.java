package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportStatus;
import com.example.storage_api.entity.SupportType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** JSON trả về cho SupportRequest. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupportRequestResponse {
    private Integer id;
    private SupportType supportType;
    private String title;
    private String description;
    private SupportPriority priority;
    private SupportStatus status;
    private Long customerId;
    private String customerName;
    private Long facilityId;
    private String facilityName;
    private Integer rentalContractId;
    private Integer storageUnitId;
    private String unitCode;
    private Long assignedStaffId;
    private String assignedStaffName;
    private LocalDateTime resolvedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

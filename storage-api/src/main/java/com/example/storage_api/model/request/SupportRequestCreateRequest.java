package com.example.storage_api.model.request;

import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của POST /api/support-requests (customer gửi yêu cầu cho một hợp đồng đang thuê). */
@Getter
@Setter
@NoArgsConstructor
public class SupportRequestCreateRequest {

    @NotNull(message = "Rental contract ID is required")
    private Integer rentalContractId;

    @NotNull(message = "Support type is required")
    private SupportType supportType;

    @NotBlank(message = "Title is required")
    @Size(max = 200, message = "Title must be at most 200 characters")
    private String title;

    @Size(max = 1000, message = "Description must be at most 1000 characters")
    private String description;

    // Bỏ trống = MEDIUM.
    private SupportPriority priority;
}

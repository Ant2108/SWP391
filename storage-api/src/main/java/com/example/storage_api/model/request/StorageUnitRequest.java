package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body của POST /api/storage-units và PUT /api/storage-units/{id}.
 *
 * Không có status: ô kho mới mặc định AVAILABLE, đổi trạng thái qua PATCH /api/storage-units/{id}/status.
 */
@Getter
@Setter
@NoArgsConstructor
public class StorageUnitRequest {

    @NotNull(message = "Facility ID is required")
    private Long facilityId;

    @NotNull(message = "Unit type ID is required")
    private Integer unitTypeId;

    @NotBlank(message = "Unit code is required")
    @Size(max = 50, message = "Unit code must be at most 50 characters")
    private String unitCode;

    @Size(max = 50, message = "Floor must be at most 50 characters")
    private String floor;

    @Size(max = 150, message = "Location must be at most 150 characters")
    private String location;
}

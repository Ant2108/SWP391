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

    @NotNull(message = "Mã cơ sở là bắt buộc")
    private Long facilityId;

    @NotNull(message = "Mã loại kho là bắt buộc")
    private Integer unitTypeId;

    @NotBlank(message = "Mã ô kho là bắt buộc")
    @Size(max = 50, message = "Mã ô kho tối đa 50 ký tự")
    private String unitCode;

    @Size(max = 50, message = "Tầng tối đa 50 ký tự")
    private String floor;

    @Size(max = 150, message = "Vị trí tối đa 150 ký tự")
    private String location;
}

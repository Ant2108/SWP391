package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.UnitStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * JSON trả về cho StorageUnit. StorageUnitService copy dữ liệu từ entity StorageUnit sang class này.
 * Có kèm unitTypeName để client hiển thị luôn tên loại kho mà không phải gọi thêm API.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StorageUnitResponse {
    private Integer id;
    private Long facilityId;
    private Integer unitTypeId;
    private String unitTypeName;
    private String unitCode;
    private String floor;
    private String location;
    private UnitStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

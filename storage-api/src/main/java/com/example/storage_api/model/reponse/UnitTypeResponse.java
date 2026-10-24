package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * JSON trả về cho UnitType. UnitTypeService copy dữ liệu từ entity UnitType sang class này.
 * Chỉ trả facilityId (số) thay vì cả object Facility để JSON gọn và không kéo theo dữ liệu thừa.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UnitTypeResponse {
    private Integer id;
    private Long facilityId;
    private String typeName;
    private BigDecimal width;
    private BigDecimal length;
    private BigDecimal height;
    private String sizeDescription;
    private String description;
    // URL ảnh (có thể null).
    private String imageUrl;
    // Trong JSON sẽ hiện là "active": true/false.
    private boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

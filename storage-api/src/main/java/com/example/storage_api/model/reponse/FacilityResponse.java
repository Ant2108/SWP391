package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.FacilityStatus;
import com.example.storage_api.entity.StockStatus;
import com.example.storage_api.entity.StorageCategory;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

/**
 * Response Model = "hình dạng JSON trả về cho client".
 * Không trả thẳng Entity ra ngoài để tránh lộ cột nội bộ và tránh lỗi khi Entity có quan hệ LAZY.
 *
 * Luồng: FacilityService đọc Facility entity từ DB -> copy sang FacilityResponse -> Spring đổi thành JSON.
 */
@Getter
@Setter
@Builder // Lombok: cho phép viết FacilityResponse.builder().id(..).name(..).build() cho dễ đọc
@NoArgsConstructor
@AllArgsConstructor
public class FacilityResponse {
    private Long id;
    private String name;
    private String address;
    private String phone;
    private LocalTime openingTime;
    private LocalTime closingTime;
    private FacilityStatus status;
    // Loại kho cung cấp (STANDARD, COLD) và tình trạng hàng (AVAILABLE, COMING_SOON, OUT_OF_STOCK).
    private Set<StorageCategory> storageTypes;
    private StockStatus stockStatus;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

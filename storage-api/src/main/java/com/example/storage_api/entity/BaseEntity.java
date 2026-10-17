package com.example.storage_api.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Lớp cha chứa 2 cột "ngày tạo" và "ngày sửa" mà cả 4 bảng đều có.
 *
 * @MappedSuperclass: lớp này KHÔNG có bảng riêng. Các field của nó được "copy" xuống bảng của
 * entity con (Facility, UnitType, StorageUnit, PriceRule) khi Hibernate tạo bảng / chạy SQL.
 *
 * Mục đích: viết một lần, không phải lặp lại createdAt / updatedAt ở 4 entity.
 */
@Getter // Lombok tự sinh getCreatedAt(), getUpdatedAt()
@Setter // Lombok tự sinh setCreatedAt(...), setUpdatedAt(...)
@MappedSuperclass
public abstract class BaseEntity {

    // Thời điểm tạo row. nullable = false: bắt buộc có. updatable = false: sau khi INSERT thì không bao giờ bị UPDATE.
    @Column(name = "CreatedAt", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // Thời điểm sửa gần nhất.
    @Column(name = "UpdatedAt")
    private LocalDateTime updatedAt;

    // Hibernate tự gọi hàm này NGAY TRƯỚC KHI INSERT row mới.
    @PrePersist
    protected void onCreate() {
        // Bước 1: lấy giờ hiện tại một lần để createdAt và updatedAt bằng nhau.
        LocalDateTime now = LocalDateTime.now();
        // Bước 2: chỉ điền createdAt nếu chưa có (không ghi đè nếu code đã chủ động set).
        if (createdAt == null) {
            createdAt = now;
        }
        // Bước 3: lần tạo đầu tiên thì updatedAt = giờ tạo.
        updatedAt = now;
    }

    // Hibernate tự gọi hàm này NGAY TRƯỚC KHI UPDATE row đã có.
    @PreUpdate
    protected void onUpdate() {
        // Mỗi lần sửa, cập nhật lại giờ sửa gần nhất.
        updatedAt = LocalDateTime.now();
    }
}

package com.example.storage_api.model.request;

import com.example.storage_api.entity.StorageCategory;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Body của POST /api/unit-types và PUT /api/unit-types/{id}.
 *
 * Các @Digits khớp decimal(10,2) của DB: nếu client gửi số quá dài thì trả 400 rõ ràng,
 * thay vì để DB báo lỗi SQL khó hiểu.
 */
@Getter
@Setter
@NoArgsConstructor
public class UnitTypeRequest {

    // @NotNull: bắt buộc phải có (dùng cho số / object, vì @NotBlank chỉ dùng cho chuỗi).
    @NotNull(message = "Facility ID is required")
    private Long facilityId;

    @NotBlank(message = "Type name is required")
    @Size(max = 100, message = "Type name must be at most 100 characters")
    private String typeName;

    // integer = 8 chữ số phần nguyên, fraction = 2 chữ số thập phân => tổng 10 chữ số, đúng decimal(10,2).
    @Digits(integer = 8, fraction = 2, message = "Width must be decimal(10,2)")
    private BigDecimal width;

    @Digits(integer = 8, fraction = 2, message = "Length must be decimal(10,2)")
    private BigDecimal length;

    @Digits(integer = 8, fraction = 2, message = "Height must be decimal(10,2)")
    private BigDecimal height;

    @Size(max = 150, message = "Size description must be at most 150 characters")
    private String sizeDescription;

    @Size(max = 500, message = "Description must be at most 500 characters")
    private String description;

    // URL ảnh của loại kho (tuỳ chọn, null = dùng ảnh mặc định). Chỉ nhận link http/https hoặc ảnh đã upload (/api/files/...), không nhận giá trị lạ như javascript:.
    @Size(max = 500, message = "Image URL must be at most 500 characters")
    @Pattern(regexp = "^(https?://\\S+|/api/files/[0-9a-f-]{36}\\.(jpg|png|gif|webp))$",
            message = "Image URL must be an http(s) link or an uploaded image")
    private String imageUrl;

    // STANDARD (kho bình thường) hoặc COLD (kho lạnh). Bỏ trống = STANDARD.
    // Gửi giá trị khác (vd "FROZEN") thì Jackson không đổi được sang enum nên trả 400.
    private StorageCategory storageCategory;
}

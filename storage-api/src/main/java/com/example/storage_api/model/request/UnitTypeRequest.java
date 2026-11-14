package com.example.storage_api.model.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
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
    @NotNull(message = "Mã cơ sở là bắt buộc")
    private Long facilityId;

    @NotBlank(message = "Tên loại kho là bắt buộc")
    @Size(max = 100, message = "Tên loại kho tối đa 100 ký tự")
    private String typeName;

    // integer = 8 chữ số phần nguyên, fraction = 2 chữ số thập phân => tổng 10 chữ số, đúng decimal(10,2).
    @Positive(message = "Chiều rộng phải lớn hơn 0")
    @Digits(integer = 8, fraction = 2, message = "Chiều rộng không hợp lệ (tối đa 8 chữ số nguyên, 2 chữ số thập phân)")
    private BigDecimal width;

    @Positive(message = "Chiều dài phải lớn hơn 0")
    @Digits(integer = 8, fraction = 2, message = "Chiều dài không hợp lệ (tối đa 8 chữ số nguyên, 2 chữ số thập phân)")
    private BigDecimal length;

    @Positive(message = "Chiều cao phải lớn hơn 0")
    @Digits(integer = 8, fraction = 2, message = "Chiều cao không hợp lệ (tối đa 8 chữ số nguyên, 2 chữ số thập phân)")
    private BigDecimal height;

    @Size(max = 150, message = "Mô tả kích thước tối đa 150 ký tự")
    private String sizeDescription;

    @Size(max = 500, message = "Mô tả tối đa 500 ký tự")
    private String description;

    // URL ảnh của loại kho (tuỳ chọn, null = dùng ảnh mặc định). Chỉ nhận link http/https hoặc ảnh đã upload (/api/files/...), không nhận giá trị lạ như javascript:.
    @Size(max = 500, message = "Đường dẫn ảnh tối đa 500 ký tự")
    @Pattern(regexp = "^(https?://\\S+|/api/files/[0-9a-f-]{36}\\.(jpg|png|gif|webp))$",
            message = "Ảnh phải là đường dẫn http(s) hoặc ảnh đã tải lên")
    private String imageUrl;
}

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

    @NotNull(message = "Mã hợp đồng là bắt buộc")
    private Integer rentalContractId;

    @NotNull(message = "Loại yêu cầu hỗ trợ là bắt buộc")
    private SupportType supportType;

    @NotBlank(message = "Tiêu đề là bắt buộc")
    @Size(max = 200, message = "Tiêu đề tối đa 200 ký tự")
    private String title;

    @Size(max = 1000, message = "Mô tả tối đa 1000 ký tự")
    private String description;

    // Bỏ trống = MEDIUM.
    private SupportPriority priority;
}

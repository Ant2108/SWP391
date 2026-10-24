package com.example.storage_api.model.request;

import com.example.storage_api.entity.UnitStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body của PATCH /api/storage-units/{id}/status. Ví dụ JSON: { "status": "MAINTENANCE" }
 */
@Getter
@Setter
@NoArgsConstructor
public class ChangeUnitStatusRequest {

    // Kiểu enum: nếu client gửi chữ không có trong UnitStatus (vd "BOGUS"), Jackson báo lỗi và API trả 400.
    @NotNull(message = "Status is required")
    private UnitStatus status;
}

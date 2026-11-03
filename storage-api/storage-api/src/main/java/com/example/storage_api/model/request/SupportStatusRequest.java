package com.example.storage_api.model.request;

import com.example.storage_api.entity.SupportStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của PATCH /api/support-requests/{id}/status. */
@Getter
@Setter
@NoArgsConstructor
public class SupportStatusRequest {

    @NotNull(message = "Status is required")
    private SupportStatus status;
}

package com.example.storage_api.model.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body của POST /api/appointments/{id}/report-no-show: staff báo khách không đến cho manager. */
@Getter
@Setter
@NoArgsConstructor
public class NoShowReportRequest {

    @NotBlank(message = "Report note is required")
    @Size(max = 250, message = "Report note must be at most 250 characters")
    private String note;
}

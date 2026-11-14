package com.example.storage_api.controller;

import com.example.storage_api.model.reponse.ReportSummaryResponse;
import com.example.storage_api.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Báo cáo kinh doanh: chỉ Business Manager và System Admin xem. */
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {
    private final ReportService reportService;

    // GET /api/reports/summary?from=2026-11-01&to=2026-11-30&facilityId=1
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('BUSINESS_MANAGER','SYSTEM_ADMIN')")
    public ReportSummaryResponse summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long facilityId) {
        return reportService.summary(from, to, facilityId);
    }
}

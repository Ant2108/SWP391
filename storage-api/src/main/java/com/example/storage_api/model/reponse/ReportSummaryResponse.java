package com.example.storage_api.model.reponse;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Báo cáo kinh doanh tổng hợp cho Business Manager. */
public record ReportSummaryResponse(
        LocalDate from,
        LocalDate to,
        Long facilityId,
        Row totals,
        List<FacilityRow> facilities,
        List<UnitTypeRow> unitTypes) {

    public record Row(
            int totalUnits,
            int availableUnits,
            int reservedUnits,
            int occupiedUnits,
            int unavailableUnits,
            BigDecimal occupancyRate,
            int pendingContracts,
            int activeContracts,
            int overdueContracts,
            int completedContracts,
            BigDecimal rentalRevenue,
            BigDecimal feeRevenue,
            BigDecimal totalRevenue,
            BigDecimal depositsCollected,
            BigDecimal depositsRefunded,
            BigDecimal depositsRetained,
            BigDecimal feesWaived) {
    }

    public record FacilityRow(Long facilityId, String facilityName, String facilityStatus, Row data) {
    }

    public record UnitTypeRow(
            String unitTypeName,
            int totalUnits,
            int occupiedUnits,
            int reservedUnits,
            int availableUnits,
            BigDecimal occupancyRate,
            BigDecimal totalRevenue) {
    }
}

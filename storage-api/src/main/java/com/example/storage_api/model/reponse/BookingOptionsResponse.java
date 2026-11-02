package com.example.storage_api.model.reponse;

import com.example.storage_api.entity.ContractStatus;

import java.time.LocalDate;
import java.util.List;

/**
 * Những gì customer đang được phép đặt lịch / gửi yêu cầu hỗ trợ:
 *  - checkIns: reservation đủ điều kiện check-in (CONFIRMED + đã gán unit + cọc PAID) và chưa có lịch check-in đang chờ.
 *  - contracts: hợp đồng ACTIVE / OVERDUE (dùng cho lịch RETURN, SUPPORT và support request).
 */
public record BookingOptionsResponse(List<CheckInOption> checkIns, List<ContractOption> contracts) {

    public record CheckInOption(Integer reservationId, Long facilityId, String facilityName,
                                String unitCode, LocalDate startDate) {
    }

    public record ContractOption(Integer rentalContractId, Long facilityId, String facilityName,
                                 String unitCode, LocalDate endDate, ContractStatus status) {
    }
}

package com.example.storage_api.model.reponse;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class PolicyResponse {
    private Integer fullRefundDays;
    private Integer dailyDeductUntilDays;
    private Integer lateRefundPercent;
    private Integer forfeitDays;
    private Integer maxBookingMonths;
    private Integer maxRenewalMonths;
    private Integer maxStartMonths;
    private Integer unpaidHoldHours;
    private Integer stage2GraceDays;
    private Integer earlyTerminationNoticeDays;
    private Integer earlyTerminationForfeitPercent;
}

package com.example.storage_api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Chính sách chung do Business Manager đặt (một dòng duy nhất, id = 1).
 * Gồm chính sách hủy đơn / hoàn cọc và các giới hạn đặt kho, gia hạn.
 * Mọi cột là Integer (cho phép null) để bảng tự thêm cột được; null = dùng giá trị mặc định trong PolicyService.
 */
@Entity
@Table(name = "BusinessPolicies")
@Getter
@Setter
@NoArgsConstructor
public class BusinessPolicy extends BaseEntity {

    @Id
    @Column(name = "PolicyId")
    private Integer id;

    /** Giữ kho dưới số ngày này thì hoàn 100% cọc. */
    @Column(name = "FullRefundDays")
    private Integer fullRefundDays;

    /** Từ FullRefundDays đến mốc này: trừ phí theo ngày (mỗi ngày = 1/ForfeitDays tiền cọc). */
    @Column(name = "DailyDeductUntilDays")
    private Integer dailyDeductUntilDays;

    /** Từ DailyDeductUntilDays đến ForfeitDays: chỉ hoàn phần trăm này của tiền cọc. */
    @Column(name = "LateRefundPercent")
    private Integer lateRefundPercent;

    /** Từ mốc này trở đi: mất toàn bộ tiền cọc. */
    @Column(name = "ForfeitDays")
    private Integer forfeitDays;

    /** Số tháng tối đa cho một đơn đặt kho. */
    @Column(name = "MaxBookingMonths")
    private Integer maxBookingMonths;

    /** Số tháng tối đa cho mỗi lần gia hạn. */
    @Column(name = "MaxRenewalMonths")
    private Integer maxRenewalMonths;

    /** Ngày nhận kho được chọn tối đa bao nhiêu tháng kể từ ngày đặt. */
    @Column(name = "MaxStartMonths")
    private Integer maxStartMonths;

    /** Số ngày được trễ hạn đóng tiền thuê Đợt 2 (có tính phí trễ) trước khi hợp đồng bị hủy. */
    @Column(name = "Stage2GraceDays")
    private Integer stage2GraceDays;

    /** Số giờ khách có để đóng cọc Đợt 1 trước khi đơn tự hủy. */
    @Column(name = "UnpaidHoldHours")
    private Integer unpaidHoldHours;

    /** Hủy hợp đồng sớm (sau khi đã nhận kho): số ngày khách phải báo trước. */
    @Column(name = "EarlyTerminationNoticeDays")
    private Integer earlyTerminationNoticeDays;

    /** Hủy hợp đồng sớm: phần trăm tiền cọc bị giữ lại (mất cọc). */
    @Column(name = "EarlyTerminationForfeitPercent")
    private Integer earlyTerminationForfeitPercent;
}

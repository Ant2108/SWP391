import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'

export const DEFAULT_POLICY = {
  fullRefundDays: 10, dailyDeductUntilDays: 20, lateRefundPercent: 25, forfeitDays: 30,
  maxBookingMonths: 2, maxRenewalMonths: 2, maxStartMonths: 1, unpaidHoldHours: 24, stage2GraceDays: 10,
  earlyTerminationNoticeDays: 7, earlyTerminationForfeitPercent: 100,
}

/** Lấy chính sách hiện hành do Business Manager đặt (hủy/hoàn cọc, giới hạn đặt kho, gia hạn…) (lỗi mạng thì dùng mặc định). */
export function useCancellationPolicy() {
  const [policy, setPolicy] = useState(DEFAULT_POLICY)
  useEffect(() => {
    let alive = true
    api.policies.get().then((p) => { if (alive && p) setPolicy({ ...DEFAULT_POLICY, ...p }) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return policy
}

/** Các dòng <li> mô tả chính sách hủy; deposit (số tiền cọc) không bắt buộc. */
export default function CancellationPolicyItems({ policy, deposit }) {
  const p = policy || DEFAULT_POLICY
  const lateKeep = 100 - p.lateRefundPercent
  const rows = [
    <li key="a">Hủy khi kho đã giữ <strong>dưới {p.fullRefundDays} ngày</strong> (tính từ lúc đóng cọc): hoàn <strong>100% tiền cọc{deposit != null ? ` (${money(deposit)})` : ''}</strong>.</li>,
    <li key="b">Hủy từ ngày thứ <strong>{p.fullRefundDays} đến {p.dailyDeductUntilDays - 1}</strong>: trừ phí giữ kho theo số ngày đã giữ (mỗi ngày bằng 1/{p.forfeitDays} tiền cọc), hoàn phần còn lại.</li>,
    <li key="c">Hủy từ ngày thứ <strong>{p.dailyDeductUntilDays} đến {p.forfeitDays - 1}</strong>: mất <strong>{lateKeep}% tiền cọc</strong>, hoàn {p.lateRefundPercent}%{deposit != null ? ` (${money(Math.round(deposit * p.lateRefundPercent / 100))})` : ''}.</li>,
    <li key="d">Từ ngày thứ <strong>{p.forfeitDays}</strong> trở đi: <strong>mất 100% tiền cọc</strong>.</li>,
  ]
  return <>{rows}</>
}

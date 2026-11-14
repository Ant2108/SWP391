import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { PageHeader, Card, Button, Input, LoadingState, ErrorState } from '../../components/ui.jsx'
import CancellationPolicyItems from '../../components/CancellationPolicy.jsx'
import { EarlyTerminationRuleItems } from '../../components/EarlyTermination.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { api } from '../../api/client.js'

const NUM_KEYS = ['fullRefundDays', 'dailyDeductUntilDays', 'lateRefundPercent', 'forfeitDays', 'maxBookingMonths', 'maxRenewalMonths', 'maxStartMonths', 'unpaidHoldHours', 'stage2GraceDays', 'earlyTerminationNoticeDays', 'earlyTerminationForfeitPercent']

/** Chính sách chung do Business Manager đặt: hủy/hoàn cọc, giới hạn đặt kho và gia hạn. Các vai trò khác chỉ xem. */
export default function Policies() {
  const toast = useToast()
  const { user } = useAuth()
  const canEdit = user?.role === 'BUSINESS_MANAGER'
  const { data, loading, error, reload } = useAsync(() => api.policies.get())
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setForm({ ...data }) }, [data])

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading || !form) return <LoadingState />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })
  const field = (k, label, props = {}) => (
    <div className="span-2">
      <Input label={label} type="number" required disabled={!canEdit} value={form[k]} onChange={set(k)} {...props} />
    </div>
  )
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = {}
      NUM_KEYS.forEach((k) => { body[k] = Number(form[k]) })
      await api.policies.update(body)
      toast('Đã lưu chính sách. Khách sẽ thấy nội dung mới ngay.')
      reload()
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Chính sách" subtitle="Quy định chung áp dụng cho toàn hệ thống: đặt kho, gia hạn, hủy đơn và hoàn tiền cọc." />
      <form onSubmit={save}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Đặt kho và gia hạn</h3>
            <div className="form-grid">
              {field('maxBookingMonths', 'Số tháng tối đa của một đơn đặt kho', { min: 1, max: 12, hint: 'Muốn thuê lâu hơn khách phải gia hạn' })}
              {field('maxRenewalMonths', 'Số tháng tối đa mỗi lần gia hạn', { min: 1, max: 12 })}
              {field('maxStartMonths', 'Ngày nhận kho được chọn xa nhất (tháng kể từ ngày đặt)', { min: 1, max: 6 })}
              {field('unpaidHoldHours', 'Thời gian giữ đơn chưa đóng cọc (giờ)', { min: 1, max: 168, hint: 'Quá thời gian này đơn tự hủy' })}
              {field('stage2GraceDays', 'Số ngày được trễ hạn đóng tiền thuê Đợt 2 (ngày)', { min: 1, max: 60, hint: 'Hạn đóng Đợt 2 = nửa thời gian thuê kể từ ngày bắt đầu. Trễ được tính phí mỗi ngày; quá số ngày này hợp đồng bị hủy, ô kho bị thu hồi' })}
            </div>
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Hủy đơn và hoàn tiền cọc</h3>
            <p className="muted" style={{ marginTop: 0 }}>Số ngày tính từ lúc khách đóng cọc Đợt 1 đến lúc khách hủy.</p>
            <div className="form-grid">
              {field('fullRefundDays', 'Hoàn 100% tiền cọc nếu giữ kho dưới (ngày)', { min: 1 })}
              {field('dailyDeductUntilDays', 'Trừ phí theo ngày cho đến trước mốc (ngày)', { min: 2, hint: 'Mỗi ngày giữ kho bị trừ 1 phần số ngày ở mốc mất cọc bên dưới' })}
              {field('lateRefundPercent', 'Giai đoạn cuối: hoàn lại (% tiền cọc)', { min: 0, max: 100 })}
              {field('forfeitDays', 'Mất toàn bộ tiền cọc từ ngày thứ', { min: 3 })}
            </div>
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Hủy hợp đồng sớm (sau khi đã nhận kho)</h3>
            <p className="muted" style={{ marginTop: 0 }}>Áp dụng khi khách muốn kết thúc hợp đồng trước hạn. Tiền thuê luôn tính trọn tháng đã dùng.</p>
            <div className="form-grid">
              {field('earlyTerminationNoticeDays', 'Khách phải báo trước (ngày)', { min: 0, max: 60 })}
              {field('earlyTerminationForfeitPercent', 'Phần trăm tiền cọc bị giữ lại (%)', { min: 0, max: 100, hint: '100 = mất toàn bộ tiền cọc' })}
            </div>
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Khách sẽ thấy</h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, lineHeight: 1.5 }}>
              <li>Đặt kho tối đa <strong>{form.maxBookingMonths} tháng</strong>; gia hạn mỗi lần tối đa <strong>{form.maxRenewalMonths} tháng</strong>.</li>
              <li>Ngày nhận kho chọn tối đa <strong>{form.maxStartMonths} tháng</strong> kể từ ngày đặt.</li>
              <li>Đóng cọc Đợt 1 trong <strong>{form.unpaidHoldHours} giờ</strong>, quá hạn đơn tự hủy.</li>
              <li>Tiền thuê Đợt 2 trả trong vòng <strong>nửa thời gian thuê</strong> kể từ ngày bắt đầu. Trễ hạn bị tính phí mỗi ngày, trễ quá <strong>{form.stage2GraceDays} ngày</strong> hợp đồng bị hủy và ô kho bị thu hồi.</li>
              <CancellationPolicyItems policy={form} />
            </ul>
            <h4 style={{ margin: '16px 0 8px' }}>Hủy hợp đồng sớm</h4>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, lineHeight: 1.5 }}>
              <EarlyTerminationRuleItems policy={form} />
            </ul>
          </Card>
        </div>
        <div style={{ marginTop: 20 }}>
          {canEdit
            ? <Button type="submit" loading={busy}><Save size={16} /> Lưu chính sách</Button>
            : <span className="muted">Chỉ Business Manager được thay đổi chính sách.</span>}
        </div>
      </form>
    </>
  )
}

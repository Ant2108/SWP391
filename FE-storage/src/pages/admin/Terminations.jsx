import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, CheckCircle2, XCircle, Banknote, Landmark } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Select, Textarea, Input, ConfirmDialog, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { fmtDate, fmtDateTime, money, unitTypeLabel } from '../../utils/format.js'

const STATUS = {
  REQUESTED: { text: 'Chờ kiểm tra kho', tone: 'yellow' },
  INSPECTED: { text: 'Chờ xác nhận hủy', tone: 'blue' },
  COMPLETED: { text: 'Đã hủy hợp đồng', tone: 'green' },
  REJECTED: { text: 'Đã từ chối', tone: 'red' },
  WITHDRAWN: { text: 'Khách đã rút', tone: 'neutral' },
}

const code = (id) => `HĐ-${String(((Number(id) * 7919 + 135791) % 899999) + 100000)}`

/**
 * Hủy hợp đồng sớm (sau khi khách đã nhận kho).
 * Quản lý: liên hệ khách, đặt lịch cho nhân viên kiểm tra kho, chốt phí hư hại (nếu có), rồi xác nhận hoặc từ chối hủy.
 * Nhân viên: xem việc và kiểm tra kho ở mục Lịch hẹn. Admin: chỉ xem.
 */
export default function Terminations() {
  const { user } = useAuth()
  const toast = useToast()
  const isManager = user?.role === 'FACILITY_MANAGER'
  const [status, setStatus] = useState('')
  const list = useAsync(() => api.terminations.list(status || undefined), [status])
  const [modal, setModal] = useState(null) // { kind: 'schedule' | 'reject' | 'confirm', t }
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const staffList = useAsync(() => (modal?.kind === 'schedule' ? api.appointments.staff() : Promise.resolve([])), [modal?.kind])

  const open = (kind, t, initial = {}) => { setModal({ kind, t }); setForm(initial) }
  const close = () => setModal(null)
  const done = (msg) => { toast(msg); close(); list.reload() }

  const run = async (fn, msg) => {
    setBusy(true)
    try { await fn(); done(msg) } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const schedule = () => {
    const t = modal.t
    if (!form.date) return toast('Vui lòng chọn ngày kiểm tra kho', 'error')
    if (!form.staffId) return toast('Vui lòng chọn nhân viên', 'error')
    return run(async () => {
      const a = await api.appointments.create({
        appointmentType: 'RETURN', rentalContractId: t.contractId, customerId: t.customerId,
        scheduledAt: `${form.date}T${form.time || '09:00'}:00`, notes: 'Kiểm tra kho khi khách hủy hợp đồng sớm',
      })
      await api.appointments.assign(a.id, Number(form.staffId))
    }, 'Đã đặt lịch kiểm tra kho và giao cho nhân viên')
  }

  const markRefund = async (t) => {
    const ref = window.prompt('Mã giao dịch chuyển khoản hoàn (có thể bỏ trống):', '')
    if (ref === null) return
    try {
      await api.payments.refundTransferred(t.refundPaymentId, { reference: ref || undefined })
      toast('Đã ghi nhận chuyển khoản hoàn cho khách')
      list.reload()
    } catch (e) { toast(e.message, 'error') }
  }

  const moneyLine = (t) => {
    if (t.status === 'REJECTED' || t.status === 'WITHDRAWN') return <span className="muted">—</span>
    const done_ = t.status === 'COMPLETED'
    return (
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        <div>{t.usedMonths}/{t.monthsTotal} tháng đã dùng · thuê {money(t.rentUsed)}</div>
        <div>Mất cọc: {money(t.depositForfeited)}{t.hasDamage && t.damageStatus === 'FEE_ISSUED' ? ` · Hư hại: ${money(t.damageFee)}` : ''}</div>
        {Number(t.extraBilled) > 0
          ? <strong style={{ color: 'var(--red)' }}>{done_ ? 'Khách phải trả thêm' : 'Dự kiến khách trả thêm'}: {money(t.extraBilled)}</strong>
          : <strong>{done_ ? 'Hoàn cho khách' : 'Dự kiến hoàn'}: {money(t.refundAmount)}</strong>}
      </div>
    )
  }

  const columns = [
    { key: 'customer', header: 'Khách hàng', render: (t) => <><div className="cell-title">{t.customerName}</div><div className="cell-sub">{t.customerPhone || '—'}</div></> },
    { key: 'unit', header: 'Hợp đồng & ô kho', render: (t) => (
      <>
        <div className="cell-title">{code(t.contractId)} · Ô {t.unitCode}</div>
        <div className="cell-sub">{[unitTypeLabel(t.unitTypeName), t.facilityName].filter(Boolean).join(' · ')}</div>
        <div className="cell-sub">{fmtDate(t.contractStart)} – {fmtDate(t.contractEnd)}</div>
      </>
    ) },
    { key: 'req', header: 'Yêu cầu', render: (t) => (
      <>
        <div>{fmtDateTime(t.requestedAt)}</div>
        <div className="cell-sub">Báo trước đến {fmtDate(t.noticeEndDate)}</div>
        {t.reason && <div className="cell-sub" style={{ whiteSpace: 'pre-wrap' }}>Lý do: {t.reason}</div>}
        {t.rejectReason && <div className="cell-sub">Từ chối: {t.rejectReason}</div>}
      </>
    ) },
    { key: 'inspect', header: 'Kiểm tra kho', render: (t) => {
      if (t.status === 'INSPECTED' || t.status === 'COMPLETED') {
        return (
          <>
            <div>{t.inspectedAt ? fmtDateTime(t.inspectedAt) : 'Đã kiểm tra'}</div>
            <div className="cell-sub">{t.hasDamage ? (t.damageStatus === 'FEE_ISSUED' ? 'Có hư hại, đã chốt phí' : 'Có hư hại, chưa chốt phí') : 'Không hư hại'}</div>
          </>
        )
      }
      if (t.status === 'REQUESTED') {
        return t.inspectionAppointmentId
          ? <><div>{fmtDateTime(t.inspectionAt)}</div><div className="cell-sub">{t.inspectionStaffName ? `Nhân viên: ${t.inspectionStaffName}` : 'Chưa gán nhân viên'}</div></>
          : <span className="muted">Chưa đặt lịch</span>
      }
      return <span className="muted">—</span>
    } },
    { key: 'money', header: 'Tiền', render: moneyLine },
    { key: 'status', header: 'Trạng thái', render: (t) => <Badge tone={STATUS[t.status]?.tone}>{STATUS[t.status]?.text || t.status}</Badge> },
    { key: 'actions', header: '', className: 'actions', render: (t) => {
      const btns = []
      if (isManager && t.status === 'REQUESTED') {
        if (!t.inspectionAppointmentId) btns.push(<Button key="s" size="sm" onClick={() => open('schedule', t, { date: '', time: '09:00', staffId: '' })}><CalendarPlus size={14} /> Đặt lịch kiểm tra kho</Button>)
        else btns.push(<Button key="a" as={Link} to="/admin/appointments" size="sm" variant="secondary">Xem lịch hẹn</Button>)
      }
      if (isManager && t.status === 'INSPECTED') {
        if (t.hasDamage && t.damageStatus !== 'FEE_ISSUED') {
          btns.push(<Button key="f" as={Link} to="/admin/appointments?view=damage" size="sm"><Banknote size={14} /> Chốt phí hư hại</Button>)
        } else {
          btns.push(<Button key="c" size="sm" onClick={() => open('confirm', t)}><CheckCircle2 size={14} /> Xác nhận hủy</Button>)
        }
      }
      if (isManager && (t.status === 'REQUESTED' || t.status === 'INSPECTED')) {
        btns.push(<Button key="r" size="sm" variant="danger-outline" onClick={() => open('reject', t, { reason: '' })}><XCircle size={14} /> Từ chối</Button>)
      }
      if (isManager && t.status === 'COMPLETED' && Number(t.refundAmount) > 0 && t.refundPaymentId) {
        btns.push(t.refundTransferred
          ? <Badge key="t" tone="green">Đã chuyển hoàn</Badge>
          : <Button key="m" size="sm" variant="secondary" onClick={() => markRefund(t)}><Landmark size={14} /> Đã chuyển khoản hoàn</Button>)
      }
      return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>{btns}</div>
    } },
  ]

  const t = modal?.t
  return (
    <>
      <PageHeader title="Hủy hợp đồng sớm" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
        </Select>
        {!isManager && <span className="muted">Nhân viên kiểm tra kho ở mục Lịch hẹn; quản lý xác nhận hủy tại đây.</span>}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey="id"
          empty={<EmptyState title="Chưa có yêu cầu hủy hợp đồng sớm nào" message="Khi khách yêu cầu hủy hợp đồng đang thuê, yêu cầu sẽ xuất hiện ở đây." />} />
      )}

      <Modal open={modal?.kind === 'schedule'} title="Đặt lịch kiểm tra kho" onClose={close}
        footer={<><Button variant="secondary" onClick={close} disabled={busy}>Đóng</Button><Button onClick={schedule} loading={busy}>Đặt lịch</Button></>}>
        {t && (
          <div className="form-grid">
            <p className="span-2 muted" style={{ margin: 0 }}>Sau khi liên hệ khách, chọn ngày giờ và nhân viên đến kiểm tra ô {t.unitCode}. Lưu ý: tiền thuê được tính đến hết {fmtDate(t.noticeEndDate)} dù kiểm tra sớm hơn.</p>
            <Input label="Ngày kiểm tra" type="date" value={form.date || ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Giờ" type="time" value={form.time || '09:00'} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            <div className="span-2">
              <Select label="Nhân viên kiểm tra" value={form.staffId || ''} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                <option value="">— Chọn nhân viên —</option>
                {(staffList.data || []).map((s) => <option key={s.id} value={s.id}>{s.fullname || s.name || s.email}</option>)}
              </Select>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal?.kind === 'reject'} title="Từ chối yêu cầu hủy hợp đồng" onClose={close}
        footer={<><Button variant="secondary" onClick={close} disabled={busy}>Đóng</Button>
          <Button variant="danger" loading={busy} onClick={() => (form.reason || '').trim() ? run(() => api.terminations.reject(t.id, form.reason.trim()), 'Đã từ chối. Hợp đồng tiếp tục có hiệu lực.') : toast('Vui lòng nhập lý do từ chối', 'error')}>Từ chối</Button></>}>
        <Textarea label="Lý do (khách sẽ được thông báo)" value={form.reason || ''} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Modal>

      <ConfirmDialog open={modal?.kind === 'confirm'} danger loading={busy} confirmText="Xác nhận hủy hợp đồng" title="Xác nhận hủy hợp đồng"
        message={t ? `Hợp đồng ${code(t.contractId)} (ô ${t.unitCode}) sẽ kết thúc. ${Number(t.extraBilled) > 0
          ? `Khách còn phải trả thêm ${money(t.extraBilled)}.`
          : `Công ty hoàn lại cho khách ${money(t.refundAmount)}.`} Ô kho sẽ ${t.hasDamage ? 'chuyển sang bảo trì' : 'trống trở lại'}. Thao tác này không hoàn tác được.` : ''}
        onClose={close} onConfirm={() => run(() => api.terminations.confirm(t.id), 'Đã xác nhận hủy hợp đồng. Khách đã được thông báo.')} />
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import GroupedList, { TileRow } from '../../components/GroupedList.jsx'
import { PageHeader, Button, Badge, DataTable, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { api } from '../../api/client.js'
import { fmtDate, fmtDateTime, label, unitTypeLabel } from '../../utils/format.js'
import { displayStatus } from '../../utils/appointment.js'

// Lịch nhận kho tự có theo mỗi đơn đặt kho (ngày nhận kho khách đã chọn lúc đặt).
// Hủy đơn / hoàn cọc / gia hạn nằm ở trang đơn đặt kho và hợp đồng, nên nút Hủy chuyển sang đó.
export default function Appointments() {
  const list = useAsync(() => api.appointments.my())
  // Lịch hẹn không có sẵn loại kho: lấy từ đơn đặt kho tương ứng để gom nhóm.
  const resv = useAsync(() => api.reservations.my().catch(() => []))
  const typeByRes = new Map((resv.data || []).map((r) => [r.id, unitTypeLabel(r.unitTypeName)]))
  const typeOf = (a) => typeByRes.get(a.reservationId) || 'Khác'

  // Bộ lọc ngày nhận kho (từ ngày – đến ngày)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const dayOf = (a) => String(a.scheduledAt || '').slice(0, 10)
  // Thứ tự: lịch sắp tới gần nhất lên đầu; lịch đã qua kế tiếp (mới nhất trước); đơn đã hủy / khách không đến xếp cuối cùng.
  const now = Date.now()
  const rank = (a) => (['CANCELLED', 'NO_SHOW'].includes(a.displayStatus || a.status) ? 2 : new Date(a.scheduledAt).getTime() >= now ? 0 : 1)
  const sorted = [...(list.data || [])]
    .filter((a) => (!from || dayOf(a) >= from) && (!to || dayOf(a) <= to))
    .sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      const ta = new Date(a.scheduledAt).getTime(), tb = new Date(b.scheduledAt).getTime()
      return ra === 0 ? ta - tb : tb - ta
    })

  const columns = [
    { key: 'order', header: 'Ngày đặt', render: (a) => <><div className="cell-title">{fmtDate(a.orderedAt)}</div><div className="cell-sub">{a.reservationId ? `Đơn đặt kho #${a.reservationId}` : `#${a.id}`}</div></> },
    { key: 'pickup', header: 'Nhận kho', render: (a) => <><div className="cell-title">{fmtDateTime(a.scheduledAt)}</div>{a.appointmentType !== 'CHECK_IN' && <div className="cell-sub">{label(a.appointmentType)}</div>}</> },
    { key: 'where', header: 'Cơ sở', render: (a) => <><div className="cell-title">{a.facilityName}</div><div className="cell-sub">{[a.facilityAddress, a.unitCode && `Ô ${a.unitCode}`].filter(Boolean).join(' · ')}</div></> },
    { key: 'staff', header: 'Nhân viên', render: (a) => a.staffName || <span className="muted">Chờ manager phân công</span> },
    { key: 'status', header: 'Trạng thái', render: (a) => {
      const s = displayStatus(a)
      return (
        <>
          <Badge tone={s.tone}>{s.text}</Badge>
          {a.displayStatus === 'NOT_PAID' && a.paymentDeadline && <div className="cell-sub">Vui lòng đóng cọc trước {fmtDateTime(a.paymentDeadline)}</div>}
        </>
      )
    } },
    { key: 'actions', header: '', className: 'actions', render: (a) => ['NOT_PAID', 'HOLDING'].includes(a.displayStatus) && a.reservationId &&
      <Button as={Link} size="sm" variant="danger-outline" to={`/account/reservations/${a.reservationId}`}><X size={14} /> Hủy đơn</Button> },
  ]

  return (
    <>
      <PageHeader title="Lịch hẹn nhận kho" subtitle="Lịch hẹn nhận kho của quý khách. Mỗi đơn đặt kho có một lịch hẹn được tạo tự động." />
      {!list.loading && !list.error && (list.data || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <span className="muted small">Ngày nhận kho:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>Từ
            <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto', minHeight: 40, padding: '6px 10px' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>đến
            <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto', minHeight: 40, padding: '6px 10px' }} />
          </label>
          {(from || to) && <Button size="sm" variant="secondary" onClick={() => { setFrom(''); setTo('') }}>Xóa lọc ngày</Button>}
        </div>
      )}
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <GroupedList storageKey="appointmentsView" items={sorted} typeOf={typeOf} columns={columns}
          renderCard={(a) => {
            const st = displayStatus(a)
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div className="cell-title" style={{ fontSize: 16 }}>{fmtDateTime(a.scheduledAt)}</div>
                    <div className="cell-sub">{a.reservationId ? `Đơn đặt kho #${a.reservationId}` : `#${a.id}`}</div>
                  </div>
                  <Badge tone={st.tone}>{st.text}</Badge>
                </div>
                <TileRow label="Cơ sở">{a.facilityName}</TileRow>
                {a.unitCode && <TileRow label="Ô kho">{a.unitCode}</TileRow>}
                <TileRow label="Nhân viên">{a.staffName || 'Chờ phân công'}</TileRow>
                <TileRow label="Ngày đặt">{fmtDate(a.orderedAt)}</TileRow>
                {a.displayStatus === 'NOT_PAID' && a.paymentDeadline && <div className="cell-sub">Đóng cọc trước {fmtDateTime(a.paymentDeadline)}</div>}
                <div style={{ marginTop: 'auto' }}>{columns.find((x) => x.key === 'actions').render(a)}</div>
              </>
            )
          }}
          statusOf={(a) => displayStatus(a).text}
          statusOptions={[...new Set(sorted.map((a) => displayStatus(a).text))].map((t) => ({ value: t, text: t }))}
          empty={<EmptyState title="Chưa có lịch hẹn nào" message="Đặt thuê kho và lịch hẹn nhận kho sẽ xuất hiện ở đây."
            action={<Button as={Link} to="/storage-options">Tìm kho phù hợp</Button>} />} />}
      <p className="muted small" style={{ marginTop: 16 }}>
        Muốn hủy đơn hoặc gia hạn, quý khách mở mục <Link to="/account/reservations" style={{ textDecoration: 'underline' }}>Đơn đặt kho</Link> hoặc <Link to="/account/contracts" style={{ textDecoration: 'underline' }}>Hợp đồng</Link>.
        Cần dời ngày nhận kho? Hãy liên hệ cơ sở qua mục <Link to="/account/support" style={{ textDecoration: 'underline' }}>Hỗ trợ</Link>, quản lý sẽ đổi lịch giúp quý khách.
      </p>
    </>
  )
}

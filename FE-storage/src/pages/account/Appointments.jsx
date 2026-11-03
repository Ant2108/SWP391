import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { api } from '../../api/client.js'
import { fmtDate, fmtDateTime, label } from '../../utils/format.js'
import { displayStatus } from '../../utils/appointment.js'

// Lịch nhận kho tự có theo mỗi đơn đặt kho (ngày nhận kho khách đã chọn lúc đặt).
// Hủy đơn / hoàn cọc / gia hạn nằm ở trang đơn đặt kho và hợp đồng, nên nút Cancel chuyển sang đó.
export default function Appointments() {
  const list = useAsync(() => api.appointments.my())

  const columns = [
    { key: 'order', header: 'Order date', render: (a) => <><div className="cell-title">{fmtDate(a.orderedAt)}</div><div className="cell-sub">{a.reservationId ? `Reservation #${a.reservationId}` : `#${a.id}`}</div></> },
    { key: 'pickup', header: 'Pickup', render: (a) => <><div className="cell-title">{fmtDateTime(a.scheduledAt)}</div>{a.appointmentType !== 'CHECK_IN' && <div className="cell-sub">{label(a.appointmentType)}</div>}</> },
    { key: 'where', header: 'Location', render: (a) => <><div className="cell-title">{a.facilityName}</div><div className="cell-sub">{[a.facilityAddress, a.unitCode && `Unit ${a.unitCode}`].filter(Boolean).join(' · ')}</div></> },
    { key: 'staff', header: 'Staff', render: (a) => a.staffName || <span className="muted">Waiting for assignment</span> },
    { key: 'status', header: 'Status', render: (a) => {
      const s = displayStatus(a)
      return (
        <>
          <Badge tone={s.tone}>{s.text}</Badge>
          {a.displayStatus === 'NOT_PAID' && a.paymentDeadline && <div className="cell-sub">Pay the deposit before {fmtDateTime(a.paymentDeadline)}</div>}
        </>
      )
    } },
    { key: 'actions', header: '', className: 'actions', render: (a) => ['NOT_PAID', 'HOLDING'].includes(a.displayStatus) && a.reservationId &&
      <Button as={Link} size="sm" variant="danger-outline" to={`/account/reservations/${a.reservationId}`}><X size={14} /> Cancel</Button> },
  ]

  return (
    <>
      <PageHeader title="Appointments" subtitle="Your pickup appointments. One is created for every storage reservation you make." />
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id"
          empty={<EmptyState title="No appointments yet" message="Reserve a storage unit and your pickup appointment will appear here."
            action={<Button as={Link} to="/storage-options">Find a storage unit</Button>} />} />}
      <p className="muted small" style={{ marginTop: 16 }}>
        To cancel an order or renew a rental, open your <Link to="/account/reservations" style={{ textDecoration: 'underline' }}>reservations</Link> or <Link to="/account/contracts" style={{ textDecoration: 'underline' }}>contracts</Link>.
        Need to move your pickup date? Contact the facility through <Link to="/account/support" style={{ textDecoration: 'underline' }}>Support</Link> and the manager will reschedule it.
      </p>
    </>
  )
}

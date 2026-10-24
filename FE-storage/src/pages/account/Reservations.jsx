import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt } from 'lucide-react'
import { PageHeader, Card, Button, Badge, DataTable, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { mock } from '../../api/mock.js'
import { money, fmtDate, fmtDateTime } from '../../utils/format.js'

export function ReservationList() {
  const { data, loading, error, reload } = useAsync(() => mock.reservations.list())
  const columns = [
    { key: 'id', header: 'Reservation', render: (r) => <><div className="cell-title">{r.id}</div><div className="cell-sub">{fmtDateTime(r.createdAt)}</div></> },
    { key: 'unit', header: 'Unit', render: (r) => <>{r.unitTypeName}<div className="cell-sub">{r.facilityName}</div></> },
    { key: 'period', header: 'Period', render: (r) => `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` },
    { key: 'total', header: 'Total', render: (r) => money(r.total) },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (r) => <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">Details</Button> },
  ]
  return (
    <>
      <PageHeader title="Reservations" subtitle="Your storage bookings." actions={<Button as={Link} to="/storage-options">Book a unit</Button>} />
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
        <DataTable columns={columns} rows={data} rowKey="id" empty={<EmptyState title="No reservations yet" message="Pick a unit size and pay to create your first reservation." />} />}
    </>
  )
}

const Row = ({ icon: Icon, label, children }) => (
  <div className="meta" style={{ alignItems: 'flex-start' }}><Icon size={18} /><div><div className="muted small">{label}</div><div>{children}</div></div></div>
)

export function ReservationDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { data: r, loading, error, reload } = useAsync(() => mock.reservations.get(id), [id])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try { await mock.reservations.cancel(id); toast('Reservation cancelled'); setConfirm(false); reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <>
      <PageHeader eyebrow={<Link to="/account/reservations"><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> All reservations</Link>}
        title={r.id} subtitle={`Booked on ${fmtDateTime(r.createdAt)}`}
        actions={r.status === 'CONFIRMED' && <Button variant="danger-outline" onClick={() => setConfirm(true)}>Cancel reservation</Button>} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3>Booking</h3><Badge status={r.status} /></div>
          <Row icon={Package} label="Unit">{r.unitTypeName}{r.unitCode ? ` · ${r.unitCode}` : ''}</Row>
          <Row icon={MapPin} label="Facility">{r.facilityName}<div className="cell-sub">{r.facilityAddress}</div></Row>
          <Row icon={CalendarDays} label="Rental period">{fmtDate(r.startDate)} → {fmtDate(r.endDate)} ({r.months} month{r.months > 1 ? 's' : ''})</Row>
        </Card>
        <Card className="loc-card">
          <h3>Charges</h3>
          <Row icon={Receipt} label={`Rent (${r.months} × ${money(r.monthlyPrice)})`}>{money(r.monthlyPrice * r.months)}</Row>
          <Row icon={Receipt} label="Deposit">{money(r.deposit)}</Row>
          <Row icon={Receipt} label="Total"><strong>{money(r.total)}</strong></Row>
          <Button as={Link} to="/account/payments" variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>View payments</Button>
        </Card>
      </div>
      <ConfirmDialog open={confirm} danger loading={busy} title="Cancel reservation" confirmText="Cancel reservation"
        message="Cancel this reservation? Refunds are handled by our staff." onConfirm={cancel} onClose={() => setConfirm(false)} />
    </>
  )
}

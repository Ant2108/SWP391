import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, CreditCard, FileText, CalendarCheck } from 'lucide-react'
import { PageHeader, Card, Button, Badge, DataTable, ConfirmDialog, Modal, Select, Input, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { money, fmtDate, fmtDateTime } from '../../utils/format.js'

const Row = ({ icon: Icon, label, children }) => (
  <div className="meta" style={{ alignItems: 'flex-start' }}>
    <Icon size={18} />
    <div>
      <div className="muted small">{label}</div>
      <div>{children}</div>
    </div>
  </div>
)

export function ReservationList() {
  const { data, loading, error, reload } = useAsync(() => api.reservations.my())
  const rows = data || []
  const columns = [
    {
      key: 'id',
      header: 'Reservation',
      render: (r) => (
        <>
          <div className="cell-title">#{r.id}</div>
          <div className="cell-sub">{fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Facility & Unit',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || 'Storage unit'}
            {r.unitCode ? ` · Unit ${r.unitCode}` : ''}
          </div>
          <div className="cell-sub">{r.facilityName || `Facility ${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Start / Term',
      render: (r) => `${fmtDate(r.startDate)} · ${r.rentalMonths} month${r.rentalMonths > 1 ? 's' : ''}`,
    },
    {
      key: 'deposit',
      header: 'Deposit',
      render: (r) => (
        <div>
          <div>{money(r.depositAmount)}</div>
          <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>{r.depositPaid ? 'PAID' : 'UNPAID'}</Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (r) => (
        <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">
          Details
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="My Reservations"
        subtitle="Track your storage bookings, assigned units, and deposit status."
        actions={<Button as={Link} to="/checkout">New reservation</Button>}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty={
            <EmptyState
              title="No reservations yet"
              message="Pick a facility and unit size to create your first reservation."
              action={<Button as={Link} to="/storage-options">Browse storage options</Button>}
            />
          }
        />
      )}
    </>
  )
}

export function ReservationDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [method, setMethod] = useState('CARD')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: r, loading, error, reload } = useAsync(() => api.reservations.get(id), [id])

  const cancel = async () => {
    setBusy(true)
    try {
      await api.reservations.cancel(id)
      toast('Reservation cancelled')
      setConfirmCancel(false)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const payDeposit = async () => {
    if (!r) return
    setBusy(true)
    try {
      let paymentId = r.pendingDepositPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          paymentType: 'DEPOSIT',
          paymentMethod: method,
          transactionReference: reference || `DEP-RSV-${r.id}`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: method,
        transactionReference: reference || `DEP-RSV-${r.id}`,
      })
      toast('Deposit paid! Your rental contract (PENDING) is ready for check-in.')
      setPayModal(false)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!r) return <EmptyState title="Reservation not found" />

  const canCancel = ['PENDING', 'CONFIRMED', 'ASSIGNED'].includes(r.status) && r.contractStatus !== 'ACTIVE'
  const canPayDeposit = !r.depositPaid && r.status !== 'CANCELLED'

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/reservations">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> All reservations
          </Link>
        }
        title={`Reservation #${r.id}`}
        subtitle={`Booked on ${fmtDateTime(r.createdAt)}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canPayDeposit && (
              <Button onClick={() => setPayModal(true)}>
                <CreditCard size={16} /> Pay deposit ({money(r.depositAmount)})
              </Button>
            )}
            {r.rentalContractId && (
              <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} variant="secondary">
                <FileText size={16} /> View Contract #{r.rentalContractId}
              </Button>
            )}
            {r.depositPaid && r.unitCode && r.status === 'CONFIRMED' && (
              <Button as={Link} to="/account/appointments" variant="secondary">
                <CalendarCheck size={16} /> Schedule Check-in
              </Button>
            )}
            {canCancel && (
              <Button variant="danger-outline" onClick={() => setConfirmCancel(true)}>
                Cancel reservation
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Booking details</h3>
            <Badge status={r.status} />
          </div>
          <Row icon={MapPin} label="Facility">
            {r.facilityName || `Facility #${r.facilityId}`}
          </Row>
          <Row icon={Package} label="Requested unit type">
            {r.unitTypeName || `Type #${r.unitTypeId}`}
          </Row>
          <Row icon={Package} label="Assigned physical unit">
            {r.unitCode ? (
              <strong>Unit {r.unitCode}</strong>
            ) : (
              <span className="muted">Waiting for facility manager to assign a unit</span>
            )}
          </Row>
          <Row icon={CalendarDays} label="Rental period">
            {fmtDate(r.startDate)} · {r.rentalMonths} month{r.rentalMonths > 1 ? 's' : ''}
          </Row>
        </Card>

        <Card className="loc-card">
          <h3>Financial & Contract status</h3>
          <Row icon={Receipt} label="Estimated total rent">
            <strong>{money(r.estimatedAmount)}</strong>
          </Row>
          <Row icon={CreditCard} label="Security deposit">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{money(r.depositAmount)}</strong>
              <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>
                {r.depositPaid ? 'PAID' : 'PENDING'}
              </Badge>
            </div>
          </Row>
          <Row icon={FileText} label="Rental contract">
            {r.rentalContractId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to={`/account/contracts/${r.rentalContractId}`} style={{ textDecoration: 'underline', fontWeight: 600 }}>
                  Contract #{r.rentalContractId}
                </Link>
                <Badge status={r.contractStatus} />
              </div>
            ) : (
              <span className="muted">
                Created automatically in PENDING status once reservation is CONFIRMED and deposit is PAID.
              </span>
            )}
          </Row>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {canPayDeposit && (
              <Button size="sm" onClick={() => setPayModal(true)}>
                Pay deposit now
              </Button>
            )}
            <Button as={Link} to="/account/payments" variant="secondary" size="sm">
              Payment history
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={payModal}
        title={`Pay Deposit for Reservation #${r.id}`}
        onClose={() => setPayModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={payDeposit} loading={busy}>
              Pay {money(r.depositAmount)}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <div className="span-2">
            <p className="muted">
              Paying the security deposit of <strong>{money(r.depositAmount)}</strong> will finalize your booking.
              {r.unitCode
                ? ` Since Unit ${r.unitCode} is already assigned, your Rental Contract (PENDING) will be generated immediately.`
                : ' Once a manager assigns your unit, your Rental Contract (PENDING) will be generated automatically.'}
            </p>
          </div>
          <div className="span-2">
            <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </Select>
          </div>
          <div className="span-2">
            <Input
              label="Transaction reference (optional)"
              placeholder="e.g. TXN-123456"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        danger
        loading={busy}
        title="Cancel reservation"
        confirmText="Cancel reservation"
        message="Are you sure you want to cancel this reservation? Any assigned storage unit will be released back to available inventory."
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  )
}

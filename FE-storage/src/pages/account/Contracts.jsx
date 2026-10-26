import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, RefreshCw, CreditCard, CalendarCheck } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { fmtDate, fmtDateTime, money, label } from '../../utils/format.js'

const Row = ({ icon: Icon, label: text, children }) => (
  <div className="meta" style={{ alignItems: 'flex-start' }}>
    <Icon size={18} />
    <div>
      <div className="muted small">{text}</div>
      <div>{children}</div>
    </div>
  </div>
)

export default function Contracts() {
  const toast = useToast()
  const [renewing, setRenewing] = useState(null)
  const [months, setMonths] = useState(1)
  const [method, setMethod] = useState('CARD')
  const [payNow, setPayNow] = useState(true)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useAsync(() => api.rentalContracts.my())

  const submitRenewal = async () => {
    if (!renewing) return
    setBusy(true)
    try {
      await api.rentalContracts.renew(renewing.id, {
        months: Number(months),
        paymentMethod: method,
        paid: payNow,
      })
      toast(
        payNow
          ? `Contract #${renewing.id} renewed for ${months} month(s) and payment recorded!`
          : `Renewal invoice created for Contract #${renewing.id}. Complete payment on the Payments page to extend your end date.`
      )
      setRenewing(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'id',
      header: 'Contract',
      render: (c) => (
        <>
          <div className="cell-title">#{c.id}</div>
          <div className="cell-sub">Reservation #{c.reservationId}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Unit & Facility',
      render: (c) => (
        <>
          <div className="cell-title">
            Unit {c.unitCode || c.storageUnitId}
            {c.unitTypeName ? ` (${c.unitTypeName})` : ''}
          </div>
          <div className="cell-sub">{c.facilityName || `Facility #${c.facilityId || ''}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Term',
      render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`,
    },
    {
      key: 'rent',
      header: 'Snapshot Price',
      render: (c) => (
        <div>
          <div>{money(c.monthlyPrice)} / mo</div>
          <div className="cell-sub">Deposit: {money(c.depositAmount)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge status={c.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button as={Link} to={`/account/contracts/${c.id}`} size="sm" variant="secondary">
            Details
          </Button>
          {['ACTIVE', 'OVERDUE'].includes(c.status) && (
            <Button
              size="sm"
              onClick={() => {
                setRenewing(c)
                setMonths(1)
                setPayNow(true)
              }}
            >
              <RefreshCw size={14} /> Renew
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Rental Contracts"
        subtitle="Your pending, active, overdue, and completed storage rental agreements."
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={data || []}
          rowKey="id"
          empty={
            <EmptyState
              title="No contracts yet"
              message="A PENDING contract is generated once your reservation is CONFIRMED and the deposit is PAID."
            />
          }
        />
      )}

      <Modal
        open={!!renewing}
        title={renewing ? `Renew Contract #${renewing.id} (Unit ${renewing.unitCode})` : 'Renew Contract'}
        onClose={() => setRenewing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitRenewal}>
              {payNow ? 'Pay & Renew Now' : 'Create Renewal Invoice'}
            </Button>
          </>
        }
      >
        {renewing && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Current end date: <strong>{fmtDate(renewing.endDate)}</strong> · Monthly rate:{' '}
                <strong>{money(renewing.monthlyPrice)}</strong>
              </p>
            </div>
            <Input
              label="Additional months"
              type="number"
              min="1"
              max="36"
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
            />
            <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </Select>
            <div className="span-2">
              <Select
                label="Payment timing"
                value={payNow ? 'NOW' : 'LATER'}
                onChange={(e) => setPayNow(e.target.value === 'NOW')}
              >
                <option value="NOW">Pay immediately & extend EndDate now</option>
                <option value="LATER">Create PENDING payment & extend EndDate when paid</option>
              </Select>
            </div>
            <div className="span-2">
              <p className="muted small">
                Estimated renewal charge: <strong>{money(Number(renewing.monthlyPrice || 0) * Number(months || 1))}</strong> (calculated from current RENEWAL PriceRule).
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export function ContractDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [renewOpen, setRenewOpen] = useState(false)
  const [months, setMonths] = useState(1)
  const [method, setMethod] = useState('CARD')
  const [payNow, setPayNow] = useState(true)
  const [busy, setBusy] = useState(false)

  const contract = useAsync(() => api.rentalContracts.get(id), [id])
  const payments = useAsync(() => api.payments.forContract(id), [id])

  const handleRenew = async () => {
    setBusy(true)
    try {
      await api.rentalContracts.renew(id, {
        months: Number(months),
        paymentMethod: method,
        paid: payNow,
      })
      toast(payNow ? 'Contract renewed and payment completed!' : 'Renewal payment created (PENDING).')
      setRenewOpen(false)
      contract.reload()
      payments.reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const settlePayment = async (p) => {
    setBusy(true)
    try {
      await api.payments.markPaid(p.id, {
        paymentMethod: 'CARD',
        transactionReference: `PAY-CNT-${id}-${p.id}`,
      })
      toast(`Payment #${p.id} (${label(p.paymentType)}) paid!`)
      contract.reload()
      payments.reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (contract.loading) return <LoadingState />
  if (contract.error) return <ErrorState error={contract.error} onRetry={contract.reload} />
  const c = contract.data
  if (!c) return <EmptyState title="Contract not found" />

  const payCols = [
    { key: 'id', header: 'Payment', render: (p) => `#${p.id}` },
    { key: 'type', header: 'Type', render: (p) => label(p.paymentType) },
    { key: 'amount', header: 'Amount', render: (p) => money(p.amount) },
    { key: 'method', header: 'Method', render: (p) => (p.paymentMethod ? label(p.paymentMethod) : '—') },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
    { key: 'date', header: 'Created / Paid', render: (p) => fmtDateTime(p.paidAt || p.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        p.status === 'PENDING' && (
          <Button size="sm" loading={busy} onClick={() => settlePayment(p)}>
            <CreditCard size={14} /> Pay Now
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/contracts">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> All rental contracts
          </Link>
        }
        title={`Rental Contract #${c.id}`}
        subtitle={`Unit ${c.unitCode || c.storageUnitId} at ${c.facilityName || `Facility #${c.facilityId || ''}`}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.status === 'PENDING' && (
              <Button as={Link} to="/account/appointments">
                <CalendarCheck size={16} /> Schedule Check-in
              </Button>
            )}
            {['ACTIVE', 'OVERDUE'].includes(c.status) && (
              <>
                <Button onClick={() => setRenewOpen(true)}>
                  <RefreshCw size={16} /> Renew Rental
                </Button>
                <Button as={Link} to="/account/appointments" variant="secondary">
                  <CalendarCheck size={16} /> Schedule Return / Support
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start', marginBottom: 32 }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Contract overview</h3>
            <Badge status={c.status} />
          </div>
          <Row icon={Package} label="Storage unit">
            <strong>Unit {c.unitCode || `#${c.storageUnitId}`}</strong>
            {c.unitTypeName ? ` (${c.unitTypeName})` : ''}
          </Row>
          <Row icon={MapPin} label="Facility">
            {c.facilityName || `Facility #${c.facilityId || ''}`}
          </Row>
          <Row icon={CalendarDays} label="Contract term">
            {fmtDate(c.startDate)} → <strong>{fmtDate(c.endDate)}</strong>
          </Row>
        </Card>

        <Card className="loc-card">
          <h3>Price snapshot</h3>
          <Row icon={Receipt} label="Snapshot monthly rent">
            <strong>{money(c.monthlyPrice)} / month</strong>
          </Row>
          <Row icon={CreditCard} label="Snapshot deposit amount">
            <strong>{money(c.depositAmount)}</strong>
          </Row>
          <p className="muted small">
            {c.status === 'PENDING'
              ? 'This contract is PENDING check-in. Once a staff member completes your check-in appointment, the contract becomes ACTIVE and the storage unit becomes OCCUPIED.'
              : c.status === 'OVERDUE'
                ? 'This contract is marked OVERDUE. Please settle any overdue fee below or renew your rental contract.'
                : 'Contract prices are snapshotted at creation time.'}
          </p>
        </Card>
      </div>

      <h3 style={{ marginBottom: 16 }}>Contract payments</h3>
      {payments.loading ? (
        <LoadingState />
      ) : payments.error ? (
        <ErrorState error={payments.error} onRetry={payments.reload} />
      ) : (
        <DataTable
          columns={payCols}
          rows={payments.data || []}
          rowKey="id"
          empty={<EmptyState title="No payments linked to this contract yet" />}
        />
      )}

      <Modal
        open={renewOpen}
        title={`Renew Contract #${c.id}`}
        onClose={() => setRenewOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={handleRenew}>
              {payNow ? 'Pay & Renew Now' : 'Create Renewal Invoice'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Input
            label="Additional months"
            type="number"
            min="1"
            max="36"
            value={months}
            onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
          />
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </Select>
          <div className="span-2">
            <Select
              label="Payment mode"
              value={payNow ? 'NOW' : 'LATER'}
              onChange={(e) => setPayNow(e.target.value === 'NOW')}
            >
              <option value="NOW">Pay now & extend EndDate immediately</option>
              <option value="LATER">Create PENDING invoice & extend EndDate when paid</option>
            </Select>
          </div>
        </div>
      </Modal>
    </>
  )
}

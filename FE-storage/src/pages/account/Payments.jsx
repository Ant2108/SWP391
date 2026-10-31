import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, CheckCircle2, Clock } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, Select, Input, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { money, fmtDateTime, label } from '../../utils/format.js'

export default function Payments() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.payments.my())
  const [payingItem, setPayingItem] = useState(null)
  const [method, setMethod] = useState('CARD')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = data || []
  const pendingRows = rows.filter((p) => p.status === 'PENDING')
  const paidRows = rows.filter((p) => p.status === 'PAID')
  const pendingTotal = pendingRows.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const paidTotal = paidRows.reduce((acc, p) => acc + Number(p.amount || 0), 0)

  const submitPay = async () => {
    if (!payingItem) return
    setBusy(true)
    try {
      await api.payments.markPaid(payingItem.id, {
        paymentMethod: method,
        transactionReference: reference || `TXN-${payingItem.id}-${Date.now()}`,
      })
      toast(`Payment #${payingItem.id} (${label(payingItem.paymentType)}) completed!`)
      setPayingItem(null)
      setReference('')
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
      header: 'Payment',
      render: (p) => (
        <>
          <div className="cell-title">#{p.id}</div>
          <div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Fee Type',
      render: (p) => (
        <>
          <div className="cell-title">{label(p.paymentType)}</div>
          <div className="cell-sub">
            {[p.unitCode && `Unit ${p.unitCode}`, p.facilityName].filter(Boolean).join(' · ') ||
              (p.rentalContractId ? `Contract #${p.rentalContractId}` : p.reservationId ? `Reservation #${p.reservationId}` : '')}
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => <strong>{money(p.amount)}</strong>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (p.paymentMethod ? label(p.paymentMethod) : <span className="muted">Pending selection</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge status={p.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {p.status === 'PENDING' && (
            <Button
              size="sm"
              onClick={() => {
                setPayingItem(p)
                setMethod(p.paymentMethod || 'CARD')
                setReference('')
              }}
            >
              <CreditCard size={14} /> Pay Now
            </Button>
          )}
          {p.rentalContractId ? (
            <Button as={Link} to={`/account/contracts/${p.rentalContractId}`} size="sm" variant="secondary">
              Contract #{p.rentalContractId}
            </Button>
          ) : p.reservationId ? (
            <Button as={Link} to={`/account/reservations/${p.reservationId}`} size="sm" variant="secondary">
              Reservation #{p.reservationId}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Payments & Billing"
        subtitle="Settle pending charges (Deposit, Rental, Renewal, Overdue Fee, Extra Fee, Damage Fee) and view your payment history."
      />

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        <Card className="stat-card">
          <div className="stat-label">
            <Clock size={18} /> Pending balance ({pendingRows.length} item{pendingRows.length === 1 ? '' : 's'})
          </div>
          <div className="stat-num">{money(pendingTotal)}</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">
            <CheckCircle2 size={18} /> Total paid ({paidRows.length} payment{paidRows.length === 1 ? '' : 's'})
          </div>
          <div className="stat-num">{money(paidTotal)}</div>
        </Card>
      </div>

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
              title="No payments yet"
              message="Payments for deposits, rentals, renewals, overdue fees, or damage fees will appear here."
            />
          }
        />
      )}

      <Modal
        open={!!payingItem}
        title={payingItem ? `Complete Payment #${payingItem.id} (${label(payingItem.paymentType)})` : 'Complete Payment'}
        onClose={() => setPayingItem(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingItem(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitPay}>
              Pay {payingItem ? money(payingItem.amount) : ''}
            </Button>
          </>
        }
      >
        {payingItem && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                You are paying <strong>{money(payingItem.amount)}</strong> for{' '}
                <strong>{label(payingItem.paymentType)}</strong>
                {payingItem.rentalContractId
                  ? ` (Contract #${payingItem.rentalContractId})`
                  : payingItem.reservationId
                    ? ` (Reservation #${payingItem.reservationId})`
                    : ''}.
              </p>
            </div>
            <div className="span-2">
              <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CARD">Credit / Debit Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash at Facility</option>
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Transaction reference (optional)"
                placeholder="e.g. BANK-REF-001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

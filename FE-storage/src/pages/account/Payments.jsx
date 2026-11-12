import { useState } from 'react'
import { QrCode, Building2, CheckCircle2 } from 'lucide-react'
import { PageHeader, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDateTime, label, money } from '../../utils/format.js'
import { formatPaymentNote, PAYMENT_METHOD_TEXT, PAYMENT_TYPE_TEXT } from '../../utils/contractDocument.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Bank transfer 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'VNPay QR Gateway' },
  { value: 'MOMO', text: 'MoMo Wallet' },
]

// Lịch sử thanh toán của khách hàng: dùng toolbar chuẩn và hiển thị rõ #ID cùng hợp đồng/đơn đặt kho liên kết.
export default function Payments() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.payments.my())
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [activePay, setActivePay] = useState(null)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [refCode, setRefCode] = useState('')
  const [busy, setBusy] = useState(false)

  const allRows = data || []
  const rows = allRows.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false
    if (typeFilter && p.paymentType !== typeFilter) return false
    return true
  })

  const confirmPay = async () => {
    if (!activePay) return
    setBusy(true)
    try {
      await api.payments.simulateGateway(activePay.id, {
        paymentMethod: method,
        transactionReference: refCode || `${method}-PAY-${activePay.id}`,
      })
      toast(`Payment #${activePay.id} (${money(activePay.amount)}) completed!`)
      setActivePay(null)
      setRefCode('')
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
      header: 'Description',
      render: (p) => {
        const note = formatPaymentNote(p)
        return (
          <div>
            <div className="cell-title">{PAYMENT_TYPE_TEXT[p.paymentType] || label(p.paymentType)}</div>
            <div className="cell-sub">
              {[
                p.rentalContractId && `Contract #${p.rentalContractId}`,
                p.reservationId && `Reservation #${p.reservationId}`,
                p.unitCode && `Unit ${p.unitCode}`,
                p.facilityName,
              ]
                .filter(Boolean)
                .join(' · ') || 'Storage payment'}
            </div>
            {note && (
              <div className="small" style={{ marginTop: 2, fontWeight: 600, color: note.tone === 'green' ? '#15803d' : note.tone === 'amber' ? '#b45309' : note.tone === 'red' ? '#b91c1c' : '#475569' }}>
                {note.text}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => <strong>{money(p.amount)}</strong>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (p.paymentMethod ? PAYMENT_METHOD_TEXT[p.paymentMethod] || label(p.paymentMethod) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge status={p.status}>{label(p.status)}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        p.status === 'PENDING' && (
          <Button
            size="sm"
            onClick={() => {
              setActivePay(p)
              setMethod(p.paymentMethod && p.paymentMethod !== 'CASH' ? p.paymentMethod : 'BANK_TRANSFER')
              setRefCode('')
            }}
          >
            <QrCode size={14} /> Pay now
          </Button>
        ),
    },
  ]

  const qrMemo = activePay ? `PAY INV ${activePay.id}` : ''
  const vietQrUrl = activePay
    ? `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${activePay.amount}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`
    : ''

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="View your deposit, rental, renewal, and fee invoices."
      />

      <div className="toolbar">
        <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </Select>
        <Select label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {PAYMENT_TYPES.map((t) => (
            <option key={t} value={t}>{PAYMENT_TYPE_TEXT[t] || label(t)}</option>
          ))}
        </Select>
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
          empty={<EmptyState title="No payments yet" message="Your deposit and rental invoices will appear here." />}
        />
      )}

      <Modal
        wide
        open={!!activePay}
        title={activePay ? `Pay Invoice #${activePay.id}` : 'Pay Invoice'}
        onClose={() => setActivePay(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActivePay(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={confirmPay}>
              <CheckCircle2 size={16} /> Confirm payment ({activePay ? money(activePay.amount) : ''})
            </Button>
          </>
        }
      >
        {activePay && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted" style={{ margin: 0 }}>
                Invoice: <strong>{PAYMENT_TYPE_TEXT[activePay.paymentType] || label(activePay.paymentType)}</strong> · Amount:{' '}
                <strong>{money(activePay.amount)}</strong>
              </p>
            </div>
            <div className="span-2">
              <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.text}</option>
                ))}
              </Select>
            </div>
            <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 18, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <img src={vietQrUrl} alt="VietQR" style={{ width: 200, height: 200, objectFit: 'contain', background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)' }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
                    <Building2 size={18} /> MB Bank · SAFESPACE STORAGE
                  </div>
                  <div className="small">Account: <strong>0901000001</strong></div>
                  <div className="small">Amount: <strong>{money(activePay.amount)}</strong></div>
                  <div className="small" style={{ marginBottom: 10 }}>Note: <strong>{qrMemo}</strong></div>
                  <Input
                    label="Transfer reference (optional)"
                    placeholder="e.g. FT26305112233"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

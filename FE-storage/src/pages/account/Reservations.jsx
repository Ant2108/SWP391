import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, QrCode, Building2, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card, Button, Badge, DataTable, ConfirmDialog, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { money, fmtDate, fmtDateTime, label } from '../../utils/format.js'

const Row = ({ icon: Icon, label: text, children }) => (
  <div className="meta" style={{ alignItems: 'flex-start' }}>
    <Icon size={18} />
    <div>
      <div className="muted small">{text}</div>
      <div>{children}</div>
    </div>
  </div>
)

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Bank transfer 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'VNPay QR Gateway' },
  { value: 'MOMO', text: 'MoMo Wallet' },
]

// Danh sách và chi tiết đơn đặt kho của khách hàng (đồng bộ #ID và trạng thái với trang Appointments của TV4).
export function ReservationList() {
  const { data, loading, error, reload } = useAsync(() => api.reservations.my())
  const rows = data || []
  const columns = [
    {
      key: 'id',
      header: 'Reservation',
      render: (r) => (
        <>
          <div className="cell-title">Reservation #{r.id}</div>
          <div className="cell-sub">{fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Unit & Facility',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || 'Storage unit'}
            {r.unitCode ? ` · Unit ${r.unitCode}` : ''}
          </div>
          <div className="cell-sub">{r.facilityName || `Facility #${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Pickup & Duration',
      render: (r) => (
        <>
          <div>{fmtDate(r.startDate)} · {r.rentalMonths} mo</div>
          {r.maxHandoverDate && <div className="cell-sub">Latest pickup: {fmtDate(r.maxHandoverDate)}</div>}
        </>
      ),
    },
    {
      key: 'stage1',
      header: 'Deposit (Stage 1)',
      render: (r) => (
        <div>
          <strong>{money(r.depositAmount ?? (r.estimatedAmount ? r.estimatedAmount * 0.5 : 0))}</strong>
          <div>
            <Badge tone={r.depositPaid ? 'green' : r.status === 'CANCELLED' ? 'neutral' : 'yellow'}>
              {r.depositPaid ? 'Paid' : r.status === 'CANCELLED' ? 'Cancelled' : 'Unpaid (24h)'}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'stage2',
      header: 'Rental (Stage 2)',
      render: (r) => (
        <div>
          <strong>{money(r.stage2RentalAmount ?? r.estimatedAmount)}</strong>
          <div>
            <Badge tone={r.stage2RentalPaid ? 'green' : r.rentalContractId ? 'blue' : 'neutral'}>
              {r.stage2RentalPaid ? 'Paid' : r.rentalContractId ? 'Ready to pay' : 'Waiting for unit'}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge status={r.status}>{label(r.status)}</Badge>,
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
        subtitle="Track your storage reservations and two-stage payments (Stage 1: Deposit · Stage 2: Rental before check-in)."
        actions={<Button as={Link} to="/storage-options">New reservation</Button>}
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
          empty={<EmptyState title="No reservations yet" message="Browse our storage options to reserve a unit." action={<Button as={Link} to="/storage-options">Find a storage unit</Button>} />}
        />
      )}
    </>
  )
}

export function ReservationDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER')
  const [transferRef, setTransferRef] = useState('')

  const { data: r, loading, error, reload } = useAsync(
    () =>
      api.reservations
        .my()
        .then((list) => (list || []).find((x) => String(x.id) === String(id)) || api.reservations.get?.(id)),
    [id]
  )

  const cancel = async () => {
    setBusy(true)
    try {
      await api.reservations.cancel(id)
      toast('Reservation cancelled. Any eligible deposit refund has been processed.')
      setConfirm(false)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const payStage1Deposit = async () => {
    if (!r) return
    setBusy(true)
    try {
      const refCode = transferRef || `${payMethod}-STAGE1-${r.id}`
      let paymentId = r.pendingDepositPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          paymentType: 'DEPOSIT',
          paymentMethod: payMethod,
          transactionReference: refCode,
          paid: false,
        })
        paymentId = created.id
      }
      await api.payments.simulateGateway(paymentId, {
        paymentMethod: payMethod,
        transactionReference: refCode,
      })
      toast(
        r.rentalContractId || r.storageUnitId
<<<<<<< Updated upstream
          ? 'Đã thanh toán thành công Đợt 1 (Đặt cọc)! Hợp đồng thuê kho điện tử đã sẵn sàng để bạn ký.'
          : 'Đã thanh toán thành công Đợt 1 (Đặt cọc)! Đơn của bạn đang chờ Quản lý cơ sở duyệt và gán ô kho để phát hành hợp đồng.'
      )
=======
          ? 'Stage 1 deposit paid! Your rental contract is ready to sign.'
          : 'Stage 1 deposit paid! A facility manager will assign your unit shortly.'
      )
      setTransferRef('')
>>>>>>> Stashed changes
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const payStage2FullRental = async () => {
    if (!r) return
    setBusy(true)
    try {
      const refCode = transferRef || `${payMethod}-STAGE2-${r.id}`
      let paymentId = r.pendingRentalPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          rentalContractId: r.rentalContractId || undefined,
          paymentType: 'RENTAL',
          paymentMethod: payMethod,
          transactionReference: refCode,
          paid: false,
        })
        paymentId = created.id
      }
      await api.payments.simulateGateway(paymentId, {
        paymentMethod: payMethod,
        transactionReference: refCode,
      })
      toast('Stage 2 rental payment completed! Make sure your contract is signed before pickup.')
      setTransferRef('')
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

  const depositAmt = r.depositAmount ?? (r.estimatedAmount ? Math.round(r.estimatedAmount * 0.5) : 500000)
  const stage2Amt = r.stage2RentalAmount ?? r.estimatedAmount ?? 1000000
  const refundableAmt = r.refundableDepositAmount ?? depositAmt
  const isDeducted20 = refundableAmt < depositAmt && refundableAmt > 0

  const deadlineDate = r.maxHandoverDate ? new Date(r.maxHandoverDate) : null
  const daysUntilDeadline = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 30

  // Chỉ mở thanh toán Đợt 2 sau khi Quản lý cơ sở đã gán ô kho và phát hành Hợp đồng.
  const canPayStage1 = r.status !== 'CANCELLED' && !r.depositPaid
  const waitingForUnitAssignment = r.status !== 'CANCELLED' && r.depositPaid && !r.rentalContractId
  const canPayStage2 = r.status !== 'CANCELLED' && r.depositPaid && !!r.rentalContractId && !r.stage2RentalPaid

  const activeAmount = canPayStage1 ? depositAmt : stage2Amt
  const qrMemo = canPayStage1 ? `DEPOSIT RES ${r.id}` : `RENTAL RES ${r.id}`
  const vietQrUrl = `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${activeAmount}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/reservations">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to reservations
          </Link>
        }
        title={`Reservation #${r.id}`}
        subtitle={`Ordered on ${fmtDateTime(r.createdAt)}`}
        actions={
          ['PENDING', 'CONFIRMED', 'ASSIGNED'].includes(r.status) && (
            <Button variant="danger-outline" onClick={() => setConfirm(true)}>
              {r.depositPaid
                ? `Cancel & refund (${money(refundableAmt + (r.stage2RentalPaid ? stage2Amt : 0))})`
                : 'Cancel reservation'}
            </Button>
          )
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Unit &amp; pickup schedule</h3>
            <Badge status={r.status}>{label(r.status)}</Badge>
          </div>
          <Row icon={Package} label="Unit type & assigned unit">
            {r.unitTypeName || 'Storage unit'}
            {r.unitCode ? <strong> · Unit {r.unitCode}</strong> : ' (Waiting for unit assignment)'}
          </Row>
          <Row icon={MapPin} label="Facility">{r.facilityName || `Facility #${r.facilityId}`}</Row>
          <Row icon={CalendarDays} label="Pickup date & duration">
            {fmtDate(r.startDate)} · {r.rentalMonths} month{r.rentalMonths > 1 ? 's' : ''} (Latest pickup: <strong>{fmtDate(r.maxHandoverDate)}</strong>)
          </Row>
          {!r.depositPaid && r.status !== 'CANCELLED' && (
            <Row icon={Clock} label="Deposit payment deadline (24h)">
              <Badge tone="yellow">Deposit not paid</Badge>
              <div className="small muted" style={{ marginTop: 4 }}>
                Pay before <strong>{fmtDateTime(r.paymentDeadline)}</strong> or the reservation will expire automatically.
              </div>
            </Row>
          )}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg-soft, #f8fafc)', border: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
              <ShieldAlert size={16} /> Deposit refund policy ({money(depositAmt)})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              <li>Cancel <strong>&gt; 10 days</strong> before deadline: <strong>100% refund ({money(depositAmt)})</strong>.</li>
              <li>Cancel or check in within the <strong>final 10 days</strong>: 20% fee deducted, <strong>80% refund ({money(Math.round(depositAmt * 0.8))})</strong>.</li>
              <li>No-show past the 1-month deadline: <strong>Deposit forfeited (0 ₫)</strong>.</li>
            </ul>
          </div>
        </Card>

        <Card className="loc-card">
          <h3>Two-stage payment summary</h3>
          <Row icon={Receipt} label="Stage 1: Security deposit">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(depositAmt)}</strong>
              <Badge tone={r.depositPaid ? 'green' : r.status === 'CANCELLED' ? 'neutral' : 'yellow'}>
                {r.depositPaid ? 'Paid' : r.status === 'CANCELLED' ? 'Cancelled' : 'Unpaid (24h window)'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Stage 2: Full rental payment">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(stage2Amt)}</strong>
              <Badge tone={r.stage2RentalPaid ? 'green' : r.rentalContractId ? 'blue' : 'neutral'}>
                {r.stage2RentalPaid
                  ? 'Paid'
                  : r.rentalContractId
                    ? 'Contract issued — Ready to pay'
                    : 'Waiting for unit assignment'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Total & refundable deposit at completion">
            <div>Total (Stage 1 + Stage 2): <strong>{money(depositAmt + stage2Amt)}</strong></div>
            <div className="small muted">
              Refundable deposit on return: <strong>{money(refundableAmt)}</strong>
              {isDeducted20 ? ' (20% late handover deduction applied)' : ' (100% of deposit)'}
            </div>
          </Row>

          {waitingForUnitAssignment && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 14, color: '#1e3a8a' }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> Stage 1 deposit paid ({money(depositAmt)})
              </div>
              <div>
                Waiting for the facility manager at <strong>{r.facilityName}</strong> to assign your storage unit and issue the rental contract. Once assigned, you can sign the contract and pay stage 2.
              </div>
            </div>
          )}

          {(canPayStage1 || canPayStage2) && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 12 }}>
                {canPayStage1 ? `Pay Stage 1: Deposit (${money(depositAmt)})` : `Pay Stage 2: Rental (${money(stage2Amt)})`}
              </h4>
              <div className="form-grid">
                <div className="span-2">
                  <Select label="Payment method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.text}</option>
                    ))}
                  </Select>
                </div>
                <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                    <img src={vietQrUrl} alt="VietQR" style={{ width: 190, height: 190, objectFit: 'contain', background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)' }} />
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={18} /> MB Bank · SAFESPACE STORAGE
                      </div>
                      <div className="small">Account: <strong>0901000001</strong></div>
                      <div className="small">Amount: <strong>{money(activeAmount)}</strong></div>
                      <div className="small" style={{ marginBottom: 10 }}>Note: <strong>{qrMemo}</strong></div>
                      <Input
                        label="Transfer reference (optional)"
                        placeholder="e.g. FT26305998877"
                        value={transferRef}
                        onChange={(e) => setTransferRef(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <Button onClick={canPayStage1 ? payStage1Deposit : payStage2FullRental} loading={busy} style={{ marginTop: 12, width: '100%' }}>
                <QrCode size={16} /> {canPayStage1 ? `Pay Stage 1 Deposit (${money(depositAmt)})` : `Pay Stage 2 Rental (${money(stage2Amt)})`}
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Button as={Link} to="/account/payments" variant="secondary" size="sm">
              Payment history
            </Button>
            <Button as={Link} to="/account/appointments" variant="secondary" size="sm">
              Pickup appointment
            </Button>
            {r.rentalContractId && (
              <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} size="sm">
                Sign &amp; view contract (#{r.rentalContractId})
              </Button>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        danger
        loading={busy}
        title="Cancel reservation"
        confirmText="Cancel reservation"
        message={
          r.depositPaid
            ? daysUntilDeadline > 10
              ? `You are cancelling more than 10 days before the deadline. 100% of your deposit (${money(depositAmt)})${r.stage2RentalPaid ? ` plus stage 2 rental (${money(stage2Amt)})` : ''} will be refunded.`
              : `You are cancelling within the final 10 days before the deadline. A 20% fee applies and 80% of your deposit (${money(Math.round(depositAmt * 0.8))})${r.stage2RentalPaid ? ` plus stage 2 rental (${money(stage2Amt)})` : ''} will be refunded.`
            : 'Are you sure you want to cancel this reservation?'
        }
        onConfirm={cancel}
        onClose={() => setConfirm(false)}
      />
    </>
  )
}

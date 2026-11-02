import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, CreditCard, FileText, CalendarCheck, QrCode, Clock, ShieldAlert } from 'lucide-react'
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
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.reservations.my())
  const [payingRes, setPayingRes] = useState(null)
  const [payStage, setPayStage] = useState('DEPOSIT') // DEPOSIT (Đợt 1) | RENTAL (Đợt 2)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const handleQuickPay = async () => {
    if (!payingRes) return
    setBusy(true)
    try {
      const isStage1 = payStage === 'DEPOSIT'
      let paymentId = isStage1 ? payingRes.pendingDepositPaymentId : payingRes.pendingRentalPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: payingRes.id,
          paymentType: payStage,
          paymentMethod: method,
          transactionReference: reference || `${method}-${payStage}-RSV-${payingRes.id}`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: method,
        transactionReference: reference || `${method}-${payStage}-RSV-${payingRes.id}`,
      })
      toast(
        isStage1
          ? `Đã thanh toán Đợt 1 (Tiền cọc) cho đơn #${payingRes.id}!`
          : `Đã thanh toán Đợt 2 (100% Tiền thuê kho) cho đơn #${payingRes.id}!`
      )
      setPayingRes(null)
      setReference('')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const rows = data || []
  const columns = [
    {
      key: 'id',
      header: 'Đơn đặt kho',
      render: (r) => (
        <>
          <div className="cell-title">#{r.id}</div>
          <div className="cell-sub">Đặt lúc: {fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Cơ sở & Ô kho',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || 'Storage unit'}
            {r.unitCode ? ` · Ô kho ${r.unitCode}` : ' · (Chờ gán ô kho)'}
          </div>
          <div className="cell-sub">{r.facilityName || `Facility ${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Ngày nhận kho / Hạn 1 tháng',
      render: (r) => (
        <>
          <div>Nhận: {fmtDate(r.startDate)} ({r.rentalMonths} tháng)</div>
          <div className="cell-sub">Hạn chót nhận: {fmtDate(r.maxHandoverDate)}</div>
        </>
      ),
    },
    {
      key: 'stage1',
      header: 'Đợt 1 (Cọc 50%)',
      render: (r) => (
        <div>
          <div><strong>{money(r.depositAmount)}</strong></div>
          <Badge status={r.depositPaid ? 'PAID' : 'CANCELLED'}>
            {r.depositPaid ? 'PAID (Đã cọc)' : 'NOT_PAID (Hạn 24h)'}
          </Badge>
          {!r.depositPaid && r.paymentDeadline && (
            <div className="cell-sub">Hạn 24h: {fmtDateTime(r.paymentDeadline)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'stage2',
      header: 'Đợt 2 (Full kho 100%)',
      render: (r) => (
        <div>
          <div><strong>{money(r.stage2RentalAmount || r.estimatedAmount)}</strong></div>
          <Badge status={r.stage2RentalPaid ? 'PAID' : 'PENDING'}>
            {r.stage2RentalPaid ? 'PAID (Đã trả Đợt 2)' : 'NOT_PAID (Đóng khi nhận kho)'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái đơn',
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      className: 'actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!r.depositPaid && r.status !== 'CANCELLED' && (
            <Button size="sm" onClick={() => { setPayingRes(r); setPayStage('DEPOSIT'); setMethod('BANK_TRANSFER') }}>
              <QrCode size={14} /> Đóng Đợt 1 (Cọc)
            </Button>
          )}
          {r.depositPaid && !r.stage2RentalPaid && r.status !== 'CANCELLED' && (
            <Button size="sm" onClick={() => { setPayingRes(r); setPayStage('RENTAL'); setMethod('BANK_TRANSFER') }}>
              <QrCode size={14} /> Đóng Đợt 2 (Full kho)
            </Button>
          )}
          {r.rentalContractId && (
            <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} size="sm" variant="secondary">
              <FileText size={14} /> Hợp đồng #{r.rentalContractId}
            </Button>
          )}
          <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">
            Chi tiết / Hủy cọc
          </Button>
        </div>
      ),
    },
  ]

  const modalAmount = payingRes
    ? (payStage === 'DEPOSIT' ? payingRes.depositAmount : (payingRes.stage2RentalAmount || payingRes.estimatedAmount))
    : 0

  return (
    <>
      <PageHeader
        title="My Reservations (Đơn đặt chỗ & Thanh toán 2 đợt)"
        subtitle="Theo dõi trạng thái thanh toán Đợt 1 (Cọc 50% — hạn 24h nếu NOT_PAID) và Đợt 2 (Thanh toán 100% tiền thuê kho khi nhận kho trong vòng tối đa 1 tháng)."
        actions={<Button as={Link} to="/checkout">Mua liền / Đặt thuê kho mới</Button>}
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
              title="Chưa có đơn đặt kho nào"
              message="Hãy chọn cơ sở và loại kho để đặt thuê kho."
              action={<Button as={Link} to="/storage-options">Xem danh sách kho</Button>}
            />
          }
        />
      )}

      <Modal
        open={!!payingRes}
        title={
          payingRes
            ? `Thanh toán ${payStage === 'DEPOSIT' ? 'Đợt 1 (Tiền cọc)' : 'Đợt 2 (100% Tiền thuê kho)'} — Đơn #${payingRes.id}`
            : 'Thanh toán'
        }
        onClose={() => setPayingRes(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingRes(null)} disabled={busy}>
              Đóng
            </Button>
            <Button onClick={handleQuickPay} loading={busy}>
              Xác nhận đã chuyển {money(modalAmount)}
            </Button>
          </>
        }
      >
        {payingRes && (
          <div className="form-grid">
            <div className="span-2">
              <Select label="Phương thức thanh toán online" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng 24/7 (VietQR)</option>
                <option value="VNPAY">Cổng VNPay QR</option>
                <option value="MOMO">Ví điện tử MoMo</option>
              </Select>
            </div>
            <div className="span-2" style={{ textAlign: 'center', background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10 }}>
              <img
                src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${modalAmount || 500000}&addInfo=${encodeURIComponent(`${payStage} RSV ${payingRes.id}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
                alt="VietQR"
                style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
              />
              <div className="small muted" style={{ marginTop: 8 }}>
                Số tiền: <strong>{money(modalAmount)}</strong> · Nội dung: <strong>{payStage} RSV {payingRes.id}</strong>
              </div>
            </div>
            <div className="span-2">
              <Input
                label="Mã giao dịch ngân hàng (tùy chọn)"
                placeholder="VD: FT263059988"
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

export function ReservationDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [payModalStage, setPayModalStage] = useState(null) // null | 'DEPOSIT' | 'RENTAL'
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: r, loading, error, reload } = useAsync(() => api.reservations.get(id), [id])

  const cancel = async () => {
    setBusy(true)
    try {
      await api.reservations.cancel(id)
      toast(
        r?.depositPaid
          ? `Đã hủy đặt cọc! Số tiền hoàn lại ngay cho bạn: ${money(r.refundableDepositAmount)}`
          : 'Đã hủy đơn đặt chỗ!'
      )
      setConfirmCancel(false)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const submitStagePayment = async () => {
    if (!r || !payModalStage) return
    setBusy(true)
    try {
      const isStage1 = payModalStage === 'DEPOSIT'
      let paymentId = isStage1 ? r.pendingDepositPaymentId : r.pendingRentalPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          paymentType: payModalStage,
          paymentMethod: method,
          transactionReference: reference || `${method}-${payModalStage}-RSV-${r.id}`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: method,
        transactionReference: reference || `${method}-${payModalStage}-RSV-${r.id}`,
      })
      toast(
        isStage1
          ? 'Đã thanh toán Đợt 1 (Tiền cọc)! Khi nhận kho bạn sẽ thanh toán Đợt 2 (100% tiền thuê kho).'
          : 'Đã thanh toán Đợt 2 (100% Tiền thuê kho)! Bạn có thể nhận kho ngay.'
      )
      setPayModalStage(null)
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
  const canPayStage1 = !r.depositPaid && r.status !== 'CANCELLED'
  const canPayStage2 = r.depositPaid && !r.stage2RentalPaid && r.status !== 'CANCELLED'
  const modalAmount = payModalStage === 'DEPOSIT' ? r.depositAmount : (r.stage2RentalAmount || r.estimatedAmount)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/reservations">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Quay lại danh sách đặt chỗ
          </Link>
        }
        title={`Đơn đặt kho #${r.id}`}
        subtitle={`Đặt lúc ${fmtDateTime(r.createdAt)} · Trạng thái thanh toán: ${r.paymentStatusLabel || ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canPayStage1 && (
              <Button onClick={() => setPayModalStage('DEPOSIT')}>
                <QrCode size={16} /> Đóng Đợt 1: Cọc ({money(r.depositAmount)})
              </Button>
            )}
            {canPayStage2 && (
              <Button onClick={() => setPayModalStage('RENTAL')}>
                <QrCode size={16} /> Đóng Đợt 2: Tiền thuê kho ({money(r.stage2RentalAmount || r.estimatedAmount)})
              </Button>
            )}
            {r.rentalContractId && (
              <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} variant="secondary">
                <FileText size={16} /> Xem Hợp đồng #{r.rentalContractId}
              </Button>
            )}
            {r.depositPaid && r.unitCode && r.status === 'CONFIRMED' && (
              <Button as={Link} to="/account/appointments" variant="secondary">
                <CalendarCheck size={16} /> Đặt lịch Check-in nhận kho
              </Button>
            )}
            {canCancel && (
              <Button variant="danger-outline" onClick={() => setConfirmCancel(true)}>
                Hủy đặt cọc / Hủy đơn
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Thông tin đặt kho & Hạn nhận kho</h3>
            <Badge status={r.status} />
          </div>
          <Row icon={MapPin} label="Cơ sở (Facility)">
            {r.facilityName || `Facility #${r.facilityId}`}
          </Row>
          <Row icon={Package} label="Loại kho & Ô kho vật lý">
            {r.unitTypeName || `Type #${r.unitTypeId}`}
            {r.unitCode ? <strong> · Ô kho {r.unitCode}</strong> : ' · (Đang chờ Manager gán ô kho)'}
          </Row>
          <Row icon={CalendarDays} label="Ngày bắt đầu nhận kho (Start Date)">
            <strong>{fmtDate(r.startDate)}</strong> · Thời hạn thuê: <strong>{r.rentalMonths} tháng</strong>
          </Row>
          <Row icon={Clock} label="Hạn chót nhận kho (Tối đa 1 tháng từ ngày cọc)">
            <strong>{fmtDate(r.maxHandoverDate)}</strong>
          </Row>
          {!r.depositPaid && r.paymentDeadline && (
            <Row icon={Clock} label="Hạn 24h phải thanh toán cọc Đợt 1">
              <strong style={{ color: '#dc2626' }}>{fmtDateTime(r.paymentDeadline)} (Trạng thái: NOT_PAID)</strong>
            </Row>
          )}
        </Card>

        <Card className="loc-card">
          <h3>Thanh toán 2 Đợt & Chính sách Hoàn cọc</h3>
          <Row icon={CreditCard} label="Đợt 1 — Tiền đặt cọc giữ kho (50%)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{money(r.depositAmount)}</strong>
              <Badge status={r.depositPaid ? 'PAID' : 'CANCELLED'}>
                {r.depositPaid ? 'PAID (Đã cọc)' : 'NOT_PAID (Hạn 24h)'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Đợt 2 — Tiền thuê kho (100% khi nhận kho)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{money(r.stage2RentalAmount || r.estimatedAmount)}</strong>
              <Badge status={r.stage2RentalPaid ? 'PAID' : 'PENDING'}>
                {r.stage2RentalPaid ? 'PAID (Đã trả đủ)' : 'NOT_PAID (Đóng khi nhận kho)'}
              </Badge>
            </div>
          </Row>
          <Row icon={ShieldAlert} label="Số tiền cọc được hoàn lại (Tính theo mốc 10 ngày cuối)">
            <strong>{money(r.refundableDepositAmount ?? r.depositAmount)}</strong>
            <div className="muted small">
              (Hủy trước hạn &gt; 10 ngày: hoàn 100% ngay; hủy trong 10 ngày cuối: phạt 20%, hoàn 80% ngay; nhận kho trong 10 ngày cuối: phạt 20%, hoàn 80% khi hết hạn HĐ; quá hạn nhận kho: mất 100% cọc).
            </div>
          </Row>
          <Row icon={FileText} label="Hợp đồng thuê kho (Rental Contract)">
            {r.rentalContractId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to={`/account/contracts/${r.rentalContractId}`} style={{ textDecoration: 'underline', fontWeight: 600 }}>
                  Hợp đồng #{r.rentalContractId}
                </Link>
                <Badge status={r.contractStatus} />
              </div>
            ) : (
              <span className="muted">Hợp đồng sẽ tự động tạo khi đơn được gán kho và đóng cọc Đợt 1.</span>
            )}
          </Row>
        </Card>
      </div>

      <Modal
        open={!!payModalStage}
        title={
          payModalStage === 'DEPOSIT'
            ? `Thanh toán Đợt 1 (Tiền cọc) — Đơn #${r.id}`
            : `Thanh toán Đợt 2 (100% Tiền thuê kho) — Đơn #${r.id}`
        }
        onClose={() => setPayModalStage(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModalStage(null)} disabled={busy}>
              Hủy
            </Button>
            <Button onClick={submitStagePayment} loading={busy}>
              Xác nhận đã chuyển {money(modalAmount)}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <div className="span-2">
            <Select label="Phương thức thanh toán online" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng 24/7 (VietQR)</option>
              <option value="VNPAY">Cổng VNPay QR</option>
              <option value="MOMO">Ví điện tử MoMo</option>
            </Select>
          </div>
          <div className="span-2" style={{ textAlign: 'center', background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10 }}>
            <img
              src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${modalAmount || 500000}&addInfo=${encodeURIComponent(`${payModalStage} RSV ${r.id}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
              alt="VietQR"
              style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
            />
            <div className="small muted" style={{ marginTop: 8 }}>
              Số tiền: <strong>{money(modalAmount)}</strong> · Nội dung: <strong>{payModalStage} RSV {r.id}</strong>
            </div>
          </div>
          <div className="span-2">
            <Input
              label="Mã giao dịch chuyển khoản (tùy chọn)"
              placeholder="VD: FT26305123456"
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
        title="Hủy đặt cọc / Hủy đơn đặt kho"
        confirmText="Xác nhận hủy & Hoàn cọc"
        message={
          r.depositPaid
            ? `Bạn đã đóng cọc ${money(r.depositAmount)}. Theo quy định mốc 10 ngày trước hạn, nếu hủy ngay lúc này bạn sẽ được hoàn trả ngay lập tức số tiền: ${money(r.refundableDepositAmount)}.`
            : 'Bạn có chắc chắn muốn hủy đơn đặt kho này?'
        }
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  )
}

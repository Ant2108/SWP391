import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, QrCode, Building2, Clock, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Button, Badge, DataTable, ConfirmDialog, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
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

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
]

const STATUS_VI = {
  PENDING: 'Chờ duyệt & gán kho',
  ASSIGNED: 'Đã gán ô kho',
  CONFIRMED: 'Đã xác nhận giữ kho',
  COMPLETED: 'Đã bàn giao kho',
  CANCELLED: 'Đã hủy',
}

// Ẩn số thứ tự tự tăng #1, #2, #3, #4 bằng mã tham chiếu bảo mật trong tài khoản Customer
const maskResCode = (r) => {
  const n = Number(r?.id || 1)
  const hash = ((n * 7919 + 135791) % 899999) + 100000
  return `RSV-${hash}`
}

export function ReservationList() {
  const { data, loading, error, reload } = useAsync(() => api.reservations.my())
  const rows = data || []
  const columns = [
    {
      key: 'code',
      header: 'Đơn đặt kho',
      render: (r) => (
        <>
          <div className="cell-title">{maskResCode(r)}</div>
          <div className="cell-sub">{fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Loại kho & Cơ sở',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || 'Kho lưu trữ'}
            {r.unitCode ? ` · Ô ${r.unitCode}` : ''}
          </div>
          <div className="cell-sub">{r.facilityName || 'Cơ sở kho'}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Ngày nhận kho & Thời hạn',
      render: (r) => (
        <>
          <div>{fmtDate(r.startDate)} · {r.rentalMonths} tháng</div>
          {r.maxHandoverDate && (
            <div className="cell-sub">Hạn chót nhận kho: {fmtDate(r.maxHandoverDate)}</div>
          )}
        </>
      ),
    },
    {
      key: 'stage1',
      header: 'Đợt 1 (Cọc 50%)',
      render: (r) => (
        <div>
          <strong>{money(r.depositAmount ?? (r.estimatedAmount ? r.estimatedAmount * 0.5 : 0))}</strong>
          <div>
            <Badge tone={r.depositPaid ? 'green' : r.status === 'CANCELLED' ? 'neutral' : 'red'}>
              {r.depositPaid ? 'Đã đóng cọc' : r.status === 'CANCELLED' ? 'Đã hủy' : 'Chưa thanh toán (Hạn 24h)'}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'stage2',
      header: 'Đợt 2 (Tiền kho 100%)',
      render: (r) => (
        <div>
          <strong>{money(r.stage2RentalAmount ?? r.estimatedAmount)}</strong>
          <div>
            <Badge tone={r.stage2RentalPaid ? 'green' : 'neutral'}>
              {r.stage2RentalPaid ? 'Đã đóng đủ' : 'Đóng khi nhận kho'}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái đơn',
      render: (r) => <Badge status={r.status}>{STATUS_VI[r.status] || r.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (r) => (
        <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">
          Xem chi tiết
        </Button>
      ),
    },
  ]
  return (
    <>
      <PageHeader
        title="Đơn Đặt Kho Của Tôi"
        subtitle="Theo dõi trạng thái thanh toán 2 đợt (Đợt 1: Cọc 50% hạn 24h · Đợt 2: Thanh toán 100% tiền kho khi nhận kho)."
        actions={<Button as={Link} to="/storage-options">Đặt thuê kho mới</Button>}
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
          empty={<EmptyState title="Chưa có đơn đặt kho nào" message="Hãy chọn loại kho phù hợp để đặt thuê ngay." />}
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
      toast('Đã hủy đơn đặt kho! Tiền đặt cọc (nếu đã đóng) đã được xử lý hoàn trả tự động theo chính sách.')
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
      let paymentId = r.pendingDepositPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          paymentType: 'DEPOSIT',
          paymentMethod: payMethod,
          transactionReference: transferRef || `${payMethod}-STAGE1`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: payMethod,
        transactionReference: transferRef || `${payMethod}-STAGE1`,
      })
      toast('Thanh toán Đợt 1 (Đặt cọc 50%) thành công!')
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
      let paymentId = r.pendingRentalPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: r.id,
          rentalContractId: r.rentalContractId || undefined,
          paymentType: 'RENTAL',
          paymentMethod: payMethod,
          transactionReference: transferRef || `${payMethod}-STAGE2`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: payMethod,
        transactionReference: transferRef || `${payMethod}-STAGE2`,
      })
      toast('Thanh toán Đợt 2 (100% tiền thuê kho) thành công! Bạn có thể đặt lịch hẹn nhận chìa khóa kho.')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!r) return <EmptyState title="Không tìm thấy đơn đặt kho" />

  const depositAmt = r.depositAmount ?? (r.estimatedAmount ? Math.round(r.estimatedAmount * 0.5) : 500000)
  const stage2Amt = r.stage2RentalAmount ?? r.estimatedAmount ?? 1000000
  const refundableAmt = r.refundableDepositAmount ?? depositAmt
  const isDeducted20 = refundableAmt < depositAmt && refundableAmt > 0

  const deadlineDate = r.maxHandoverDate ? new Date(r.maxHandoverDate) : null
  const today = new Date()
  const daysUntilDeadline = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : 30

  const activeAmount = !r.depositPaid ? depositAmt : stage2Amt
  const qrMemo = !r.depositPaid ? `COC DOT 1 ${maskResCode(r)}` : `THUE KHO DOT 2 ${maskResCode(r)}`
  const vietQrUrl = `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${activeAmount}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/reservations">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Danh sách đơn đặt kho
          </Link>
        }
        title={`Chi Tiết Đơn Đặt Kho (${maskResCode(r)})`}
        subtitle={`Ngày tạo đơn: ${fmtDateTime(r.createdAt)}`}
        actions={
          ['PENDING', 'CONFIRMED', 'ASSIGNED'].includes(r.status) && (
            <Button variant="danger-outline" onClick={() => setConfirm(true)}>
              {r.depositPaid
                ? `Hủy đặt kho & Nhận lại cọc (${money(refundableAmt)})`
                : 'Hủy đơn đặt kho'}
            </Button>
          )
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Thông tin kho & Thời hạn nhận kho</h3>
            <Badge status={r.status}>{STATUS_VI[r.status] || r.status}</Badge>
          </div>
          <Row icon={Package} label="Loại kho & Ô kho được gán">
            {r.unitTypeName || 'Kho lưu trữ'}
            {r.unitCode ? <strong> · Ô kho {r.unitCode}</strong> : ' (Đang chờ Quản lý cơ sở gán ô kho)'}
          </Row>
          <Row icon={MapPin} label="Cơ sở kho">{r.facilityName || 'Cơ sở kho'}</Row>
          <Row icon={CalendarDays} label="Ngày bắt đầu thuê & Thời hạn">
            {fmtDate(r.startDate)} · {r.rentalMonths} tháng (Hạn chót nhận kho tối đa 1 tháng: <strong>{fmtDate(r.maxHandoverDate)}</strong>)
          </Row>
          {!r.depositPaid && r.status !== 'CANCELLED' && (
            <Row icon={Clock} label="Trạng thái thanh toán & Hạn 24h">
              <Badge tone="red">Chưa thanh toán (Hạn 24 giờ)</Badge>
              <div className="small muted" style={{ marginTop: 4 }}>
                Hạn thanh toán Đợt 1 trong vòng 24h kể từ lúc đặt: <strong>{fmtDateTime(r.paymentDeadline)}</strong> (Quá 24h đơn tự động hủy).
              </div>
            </Row>
          )}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
              <ShieldAlert size={16} /> Chính sách hoàn / khấu trừ tiền cọc ({money(depositAmt)})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#78350f', lineHeight: 1.5 }}>
              <li>Hủy trước hạn nhận kho <strong>&gt; 10 ngày</strong>: Hoàn trả <strong>ngay lập tức 100% cọc ({money(depositAmt)})</strong>.</li>
              <li>Hủy trong <strong>10 ngày cuối</strong> trước hạn: Phạt 20%, hoàn trả <strong>ngay lập tức 80% cọc ({money(Math.round(depositAmt * 0.8))})</strong>.</li>
              <li>Nhận kho trong <strong>10 ngày cuối</strong> trước hạn: Phạt 20% cọc, khi hết hạn hợp đồng hoàn lại <strong>80% cọc ({money(Math.round(depositAmt * 0.8))})</strong>.</li>
              <li>Quá hạn 1 tháng không nhận kho: <strong>Mất 100% tiền cọc (0đ)</strong>.</li>
            </ul>
          </div>
        </Card>

        <Card className="loc-card">
          <h3>Lộ trình Thanh toán 2 Đợt</h3>
          <Row icon={Receipt} label="Đợt 1: Tiền đặt cọc giữ chỗ (50% giá trị kho)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(depositAmt)}</strong>
              <Badge tone={r.depositPaid ? 'green' : 'red'}>
                {r.depositPaid ? 'Đã đóng cọc Đợt 1' : 'Chưa thanh toán (Hạn 24h)'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Đợt 2: Thanh toán 100% tiền thuê kho khi nhận kho">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(stage2Amt)}</strong>
              <Badge tone={r.stage2RentalPaid ? 'green' : 'neutral'}>
                {r.stage2RentalPaid ? 'Đã thanh toán đủ Đợt 2' : 'Chờ thanh toán khi nhận kho'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Tổng cộng 2 đợt & Tiền cọc hoàn lại cuối kỳ">
            <div>Tổng 2 đợt: <strong>{money(depositAmt + stage2Amt)}</strong></div>
            <div className="small muted">
              Hoàn trả khi hết hạn thuê kho: <strong>{money(refundableAmt)}</strong>
              {isDeducted20 ? ' (Đã trừ 20% do sát hạn 10 ngày)' : ' (100% tiền cọc)'}
            </div>
          </Row>

          {r.status !== 'CANCELLED' && (!r.depositPaid || !r.stage2RentalPaid) && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 12 }}>
                {!r.depositPaid
                  ? `Thanh toán Đợt 1: Đặt cọc 50% (${money(depositAmt)})`
                  : `Thanh toán Đợt 2: Tiền thuê kho 100% (${money(stage2Amt)})`}
              </h4>
              <div className="form-grid">
                <div className="span-2">
                  <Select label="Phương thức thanh toán" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.text}</option>
                    ))}
                  </Select>
                </div>
                <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <img
                      src={vietQrUrl}
                      alt="VietQR"
                      style={{ width: 120, height: 120, objectFit: 'contain', background: '#fff', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={15} /> MB Bank · SAFESPACE STORAGE
                      </div>
                      <div className="small muted">Số tiền: <strong>{money(activeAmount)}</strong></div>
                      <div className="small muted">Nội dung CK: <strong>{qrMemo}</strong></div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Input
                      label="Mã giao dịch chuyển khoản (tùy chọn)"
                      placeholder="VD: FT26305998877"
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {!r.depositPaid ? (
                <Button onClick={payStage1Deposit} loading={busy} style={{ marginTop: 12, width: '100%' }}>
                  <QrCode size={16} /> Xác nhận thanh toán Đợt 1 - Đặt cọc 50% ({money(depositAmt)})
                </Button>
              ) : (
                <Button onClick={payStage2FullRental} loading={busy} style={{ marginTop: 12, width: '100%' }}>
                  <QrCode size={16} /> Xác nhận thanh toán Đợt 2 - Nhận kho 100% ({money(stage2Amt)})
                </Button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Button as={Link} to="/account/payments" variant="secondary" size="sm">
              Lịch sử thanh toán
            </Button>
            {r.rentalContractId && (
              <Button as={Link} to="/account/contracts" size="sm">
                Xem & Ký hợp đồng Online
              </Button>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        danger
        loading={busy}
        title="Xác nhận hủy đặt chỗ & Hoàn tiền cọc"
        confirmText="Xác nhận hủy đơn"
        message={
          r.depositPaid
            ? daysUntilDeadline > 10
              ? `Bạn đang hủy trước hạn nhận kho hơn 10 ngày. Hệ thống sẽ hoàn trả NGAY LẬP TỨC 100% tiền cọc (${money(depositAmt)}) cho bạn.`
              : `Bạn đang hủy trong vòng 10 ngày cuối trước hạn nhận kho. Theo quy định, hệ thống khấu trừ 20% phí phạt và hoàn trả NGAY LẬP TỨC 80% cọc (${money(Math.round(depositAmt * 0.8))}) cho bạn.`
            : 'Bạn có chắc chắn muốn hủy đơn đặt kho này không?'
        }
        onConfirm={cancel}
        onClose={() => setConfirm(false)}
      />
    </>
  )
}

import { useState } from 'react'
import CancellationPolicyItems, { useCancellationPolicy } from '../../components/CancellationPolicy.jsx'
import { unitTypeLabel } from '../../utils/format.js'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, QrCode, Building2, Clock, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Button, Badge, DataTable, ConfirmDialog, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { money, fmtDate, fmtDateTime } from '../../utils/format.js'
import GroupedList, { TileRow } from '../../components/GroupedList.jsx'
import BankQrPay from '../../components/BankQrPay.jsx'
import { ContractProfileModal } from './ContractProfile.jsx'
import DraftContract from '../../components/DraftContract.jsx'

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
  CONFIRMED: 'Đã gán ô kho, chờ nhận kho',
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
  const all = data || []
  const typeOf = (r) => unitTypeLabel(r.unitTypeName) || 'Kho lưu trữ'
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
            {unitTypeLabel(r.unitTypeName) || 'Kho lưu trữ'}
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
      header: 'Đợt 1 (Tiền cọc)',
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
              {r.stage2RentalPaid ? 'Đã đóng đủ' : `Hạn ${fmtDate(r.rentalDueDate)}`}
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
        subtitle="Theo dõi trạng thái thanh toán 2 đợt (Đợt 1: Đặt cọc, hạn 24h · Đợt 2: Thanh toán 100% tiền kho trong vòng nửa thời gian thuê)."
        actions={<Button as={Link} to="/checkout">Đặt thuê kho mới</Button>}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <GroupedList
          storageKey="resView"
          items={all}
          typeOf={typeOf}
          columns={columns}
          statusOf={(r) => r.status}
          statusOptions={Object.entries(STATUS_VI).map(([value, text]) => ({ value, text }))}
          groupNote={(list) => <>Tổng tiền cọc: <strong style={{ color: 'var(--text)' }}>{money(list.reduce((t, r) => t + Number(r.depositAmount ?? 0), 0))}</strong></>}
          renderCard={(r) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div className="cell-title" style={{ fontSize: 16 }}>{maskResCode(r)}</div>
                  <div className="cell-sub">{r.unitCode ? `Ô ${r.unitCode} · ` : ''}{r.facilityName || 'Cơ sở kho'}</div>
                </div>
                <Badge status={r.status}>{STATUS_VI[r.status] || r.status}</Badge>
              </div>
              <TileRow label="Nhận kho">{fmtDate(r.startDate)} · {r.rentalMonths} tháng</TileRow>
              <TileRow label="Đợt 1 (cọc)">{money(r.depositAmount ?? 0)} {r.depositPaid ? <Badge tone="green">Đã đóng</Badge> : r.status === 'CANCELLED' ? null : <Badge tone="red">Chưa đóng</Badge>}</TileRow>
              <TileRow label="Đợt 2 (tiền kho)">{money(r.stage2RentalAmount ?? r.estimatedAmount)} {r.stage2RentalPaid ? <Badge tone="green">Đã đóng đủ</Badge> : r.status === 'CANCELLED' ? null : <span className="muted small">hạn {fmtDate(r.rentalDueDate)}</span>}</TileRow>
              <div style={{ marginTop: 'auto' }}>
                <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">Xem chi tiết</Button>
              </div>
            </>
          )}
          empty={<EmptyState title="Chưa có đơn đặt kho nào" message="Hãy chọn loại kho phù hợp để đặt thuê ngay." />}
        />
      )}
    </>
  )
}

export function ReservationDetail() {
  const { id } = useParams()
  const toast = useToast()
  const policy = useCancellationPolicy()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

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

  // Khoản thu đang chờ (cọc Đợt 1 hoặc Đợt 2) để hiện mã QR; backend đã tạo sẵn hóa đơn ở trạng thái PENDING.
  const pendingPayId = r ? (!r.depositPaid ? r.pendingDepositPaymentId : r.pendingRentalPaymentId) : null
  const pendingPay = useAsync(() => (pendingPayId ? api.payments.get(pendingPayId) : Promise.resolve(null)), [pendingPayId])

  // Nút thử nghiệm trong lúc chưa dùng ngân hàng thật; sẽ bỏ khi chạy thật.
  const demoPay = async () => {
    setBusy(true)
    try {
      await api.payments.simulateGateway(pendingPayId, { paymentMethod: 'BANK_TRANSFER' })
      toast('[Demo] Đã giả lập thanh toán thành công.')
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
            {unitTypeLabel(r.unitTypeName) || 'Kho lưu trữ'}
            {r.unitCode ? <strong> · Ô kho {r.unitCode}</strong> : ' (Đang chờ Quản lý cơ sở gán ô kho)'}
          </Row>
          <Row icon={MapPin} label="Cơ sở kho">{r.facilityName || 'Cơ sở kho'}</Row>
          <Row icon={CalendarDays} label="Ngày bắt đầu thuê & Thời hạn">
            {fmtDate(r.startDate)} · {r.rentalMonths} tháng (Hạn chót nhận kho: <strong>{fmtDate(r.maxHandoverDate)}</strong>)
          </Row>
          {!r.depositPaid && r.status !== 'CANCELLED' && (
            <Row icon={Clock} label="Trạng thái thanh toán & hạn đóng cọc">
              <Badge tone="red">Chưa thanh toán (hạn {policy.unpaidHoldHours} giờ)</Badge>
              <div className="small muted" style={{ marginTop: 4 }}>
                Hạn thanh toán Đợt 1 trong vòng 24h kể từ lúc đặt: <strong>{fmtDateTime(r.paymentDeadline)}</strong> (Quá 24h đơn tự động hủy).
              </div>
            </Row>
          )}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--orange-soft)', border: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--orange)', marginBottom: 4 }}>
              <ShieldAlert size={16} /> Chính sách hoàn / khấu trừ tiền cọc ({money(depositAmt)})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', lineHeight: 1.5 }}>
              <CancellationPolicyItems policy={policy} deposit={depositAmt} />
              <li>Khi nhận kho, tiền cọc được giữ đến hết hợp đồng, hoàn lại sau khi trừ phí phát sinh (nếu có).</li>
            </ul>
          </div>
        </Card>

        <Card className="loc-card">
          <h3>Lộ trình Thanh toán 2 Đợt</h3>
          <Row icon={Receipt} label="Đợt 1: Tiền đặt cọc giữ chỗ">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(depositAmt)}</strong>
              <Badge tone={r.depositPaid ? 'green' : 'red'}>
                {r.depositPaid ? 'Đã đóng cọc Đợt 1' : 'Chưa thanh toán (Hạn 24h)'}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Đợt 2: Thanh toán 100% tiền thuê kho (trong vòng nửa thời gian thuê)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{money(stage2Amt)}</strong>
              <Badge tone={r.stage2RentalPaid ? 'green' : 'neutral'}>
                {r.stage2RentalPaid ? 'Đã thanh toán đủ Đợt 2' : (r.rentalDueDate ? `Hạn đóng: ${fmtDate(r.rentalDueDate)}` : 'Chờ thanh toán')}
              </Badge>
            </div>
          </Row>
          <Row icon={Receipt} label="Tổng cộng 2 đợt & Tiền cọc hoàn lại cuối kỳ">
            <div>Tổng 2 đợt: <strong>{money(depositAmt + stage2Amt)}</strong></div>
            <div className="small muted">
              Hoàn trả khi hết hạn thuê kho: <strong>{money(refundableAmt)}</strong>
              {isDeducted20 ? ' (số tiền hoàn nếu hủy ngay bây giờ, đã trừ phí giữ kho)' : ' (100% tiền cọc)'}
            </div>
          </Row>

          {r.status !== 'CANCELLED' && (!r.depositPaid || !r.stage2RentalPaid) && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 12 }}>
                {!r.depositPaid
                  ? `Thanh toán Đợt 1: Đặt cọc (${money(depositAmt)})`
                  : `Thanh toán Đợt 2: Tiền thuê kho 100% (${money(stage2Amt)})`}
              </h4>
              {pendingPay.loading ? (
                <LoadingState />
              ) : pendingPay.data ? (
                <>
                  <BankQrPay
                    payment={pendingPay.data}
                    onPaid={() => {
                      toast('Đã nhận được tiền. Cảm ơn quý khách!')
                      reload()
                    }}
                  />
                  <Button variant="secondary" size="sm" onClick={demoPay} loading={busy} style={{ marginTop: 10 }}>
                    <QrCode size={14} /> [Demo] Giả lập đã thanh toán
                  </Button>
                </>
              ) : (
                <p className="muted">Hóa đơn thanh toán chưa sẵn sàng, vui lòng tải lại trang.</p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Button as={Link} to="/account/payments" variant="secondary" size="sm">
              Lịch sử thanh toán
            </Button>
            {r.depositPaid && r.status !== 'CANCELLED' && (
              <Button size="sm" onClick={() => setProfileOpen(true)}>
                Điền hồ sơ hợp đồng
              </Button>
            )}
            {r.rentalContractId && (
              <Button as={Link} to="/account/contracts" size="sm" variant="secondary">
                Xem & ký hợp đồng
              </Button>
            )}
          </div>
          {r.depositPaid && r.status !== 'CANCELLED' && !r.rentalContractId && <DraftContract reservation={r} />}
          {r.depositPaid && r.status !== 'CANCELLED' && (
            <p className="muted small" style={{ marginTop: 10 }}>
              Quý khách đã đóng cọc. Vui lòng điền hồ sơ thông tin hợp đồng (thông tin cá nhân, ảnh CCCD) để hệ thống lập hợp đồng. Quý khách cũng có thể đến cơ sở gặp nhân viên để điền và ký trực tiếp.
            </p>
          )}
        </Card>
      </div>

      <ContractProfileModal reservationId={profileOpen ? r.id : null} onClose={() => setProfileOpen(false)} />

      <ConfirmDialog
        open={confirm}
        danger
        loading={busy}
        title="Xác nhận hủy đặt chỗ & Hoàn tiền cọc"
        confirmText="Xác nhận hủy đơn"
        message={
          r.depositPaid
            ? `Nếu hủy ngay bây giờ, tiền cọc được hoàn lại là ${money(refundableAmt)} (cọc ban đầu ${money(depositAmt)}; phần chênh lệch là phí giữ kho theo chính sách). Khoản hoàn được chuyển thủ công về tài khoản bạn đã dùng để chuyển cọc.`
            : 'Bạn có chắc chắn muốn hủy đơn đặt kho này không?'
        }
        onConfirm={cancel}
        onClose={() => setConfirm(false)}
      />
    </>
  )
}

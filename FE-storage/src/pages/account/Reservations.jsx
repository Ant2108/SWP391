import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, CreditCard, FileText, CalendarCheck, QrCode } from 'lucide-react'
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
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const handleQuickPayDeposit = async () => {
    if (!payingRes) return
    setBusy(true)
    try {
      let paymentId = payingRes.pendingDepositPaymentId
      if (!paymentId) {
        const created = await api.payments.create({
          reservationId: payingRes.id,
          paymentType: 'DEPOSIT',
          paymentMethod: method,
          transactionReference: reference || `${method}-RSV-${payingRes.id}`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: method,
        transactionReference: reference || `${method}-RSV-${payingRes.id}`,
      })
      toast(`Đã thanh toán tiền cọc cho đơn #${payingRes.id}!`)
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
      header: 'Facility & Assigned Unit',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || 'Storage unit'}
            {r.unitCode ? ` · Ô kho ${r.unitCode}` : ' · (Chờ Manager gán ô kho)'}
          </div>
          <div className="cell-sub">{r.facilityName || `Facility ${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Start / Term',
      render: (r) => `${fmtDate(r.startDate)} · ${r.rentalMonths} tháng`,
    },
    {
      key: 'deposit',
      header: 'Tiền cọc (Deposit)',
      render: (r) => (
        <div>
          <div>{money(r.depositAmount)}</div>
          <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>{r.depositPaid ? 'ĐÃ ĐÓNG CỌC' : 'CHƯA ĐÓNG CỌC'}</Badge>
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
            <Button size="sm" onClick={() => { setPayingRes(r); setMethod('BANK_TRANSFER') }}>
              <QrCode size={14} /> Đóng cọc
            </Button>
          )}
          {r.rentalContractId && (
            <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} size="sm" variant="secondary">
              <FileText size={14} /> Hợp đồng #{r.rentalContractId}
            </Button>
          )}
          <Button as={Link} to={`/account/reservations/${r.id}`} size="sm" variant="secondary">
            Chi tiết
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="My Reservations (Đơn đặt chỗ thuê kho)"
        subtitle="Bước 1: Theo dõi đơn đăng ký thuê kho của bạn. Sau khi Quản lý gán ô kho (CONFIRMED) và bạn đóng tiền cọc (PAID), hệ thống sẽ tự động tạo Hợp đồng thuê kho (Rental Contract) để bạn hẹn ngày đến nhận chìa khóa."
        actions={<Button as={Link} to="/checkout">Đặt thuê kho mới</Button>}
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
              message="Hãy chọn cơ sở và loại kho để gửi yêu cầu đặt chỗ đầu tiên."
              action={<Button as={Link} to="/storage-options">Xem danh sách kho</Button>}
            />
          }
        />
      )}

      <Modal
        open={!!payingRes}
        title={payingRes ? `Thanh toán tiền cọc đơn #${payingRes.id}` : 'Thanh toán tiền cọc'}
        onClose={() => setPayingRes(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingRes(null)} disabled={busy}>
              Đóng
            </Button>
            <Button onClick={handleQuickPayDeposit} loading={busy}>
              Xác nhận đã chuyển {payingRes ? money(payingRes.depositAmount) : ''}
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
                src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${payingRes.depositAmount || 500000}&addInfo=${encodeURIComponent(`COC RSV ${payingRes.id}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
                alt="VietQR"
                style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
              />
              <div className="small muted" style={{ marginTop: 8 }}>
                Số tiền cọc: <strong>{money(payingRes.depositAmount)}</strong> · Nội dung: <strong>COC RSV {payingRes.id}</strong>
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
  const [payModal, setPayModal] = useState(false)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: r, loading, error, reload } = useAsync(() => api.reservations.get(id), [id])

  const cancel = async () => {
    setBusy(true)
    try {
      await api.reservations.cancel(id)
      toast('Đã hủy đơn đặt chỗ')
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
          transactionReference: reference || `${method}-RSV-${r.id}`,
        })
        paymentId = created.id
      }
      await api.payments.markPaid(paymentId, {
        paymentMethod: method,
        transactionReference: reference || `${method}-RSV-${r.id}`,
      })
      toast('Đã thanh toán tiền cọc! Hợp đồng thuê kho (PENDING) đã sẵn sàng để đặt lịch Check-in.')
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
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Quay lại danh sách đặt chỗ
          </Link>
        }
        title={`Đơn đặt kho #${r.id}`}
        subtitle={`Tạo lúc ${fmtDateTime(r.createdAt)}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canPayDeposit && (
              <Button onClick={() => setPayModal(true)}>
                <QrCode size={16} /> Thanh toán cọc ({money(r.depositAmount)})
              </Button>
            )}
            {r.rentalContractId && (
              <Button as={Link} to={`/account/contracts/${r.rentalContractId}`} variant="secondary">
                <FileText size={16} /> Xem Hợp đồng #{r.rentalContractId}
              </Button>
            )}
            {r.depositPaid && r.unitCode && r.status === 'CONFIRMED' && (
              <Button as={Link} to="/account/appointments">
                <CalendarCheck size={16} /> Đặt lịch hẹn Check-in nhận kho
              </Button>
            )}
            {canCancel && (
              <Button variant="danger-outline" onClick={() => setConfirmCancel(true)}>
                Hủy đặt chỗ
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Thông tin đặt kho</h3>
            <Badge status={r.status} />
          </div>
          <Row icon={MapPin} label="Cơ sở (Facility)">
            {r.facilityName || `Facility #${r.facilityId}`}
          </Row>
          <Row icon={Package} label="Loại kho yêu cầu (Unit Type)">
            {r.unitTypeName || `Type #${r.unitTypeId}`}
          </Row>
          <Row icon={Package} label="Ô kho vật lý được gán (Assigned Unit)">
            {r.unitCode ? (
              <strong>Ô kho {r.unitCode}</strong>
            ) : (
              <span className="muted">Đang chờ Quản lý cơ sở kiểm tra và gán ô kho trống</span>
            )}
          </Row>
          <Row icon={CalendarDays} label="Thời gian thuê đăng ký">
            Bắt đầu {fmtDate(r.startDate)} · Thời hạn {r.rentalMonths} tháng
          </Row>
        </Card>

        <Card className="loc-card">
          <h3>Trạng thái Tiền cọc & Hợp đồng</h3>
          <Row icon={Receipt} label="Tổng tiền thuê dự kiến">
            <strong>{money(r.estimatedAmount)}</strong>
          </Row>
          <Row icon={CreditCard} label="Tiền đặt cọc (Deposit)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{money(r.depositAmount)}</strong>
              <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>
                {r.depositPaid ? 'PAID' : 'PENDING'}
              </Badge>
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
              <span className="muted">
                Hợp đồng (trạng thái PENDING) sẽ tự động sinh ra ngay khi đơn được gán kho (CONFIRMED) và bạn hoàn tất đóng tiền cọc (PAID).
              </span>
            )}
          </Row>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {canPayDeposit && (
              <Button size="sm" onClick={() => setPayModal(true)}>
                <QrCode size={14} /> Quét QR đóng cọc ngay
              </Button>
            )}
            <Button as={Link} to="/account/payments" variant="secondary" size="sm">
              Lịch sử thanh toán
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={payModal}
        title={`Thanh toán tiền cọc cho Đơn #${r.id}`}
        onClose={() => setPayModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)} disabled={busy}>
              Hủy
            </Button>
            <Button onClick={payDeposit} loading={busy}>
              Xác nhận đã chuyển {money(r.depositAmount)}
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
              src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${r.depositAmount || 500000}&addInfo=${encodeURIComponent(`COC RSV ${r.id}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
              alt="VietQR"
              style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
            />
            <div className="small muted" style={{ marginTop: 8 }}>
              Số tiền cọc: <strong>{money(r.depositAmount)}</strong> · Nội dung: <strong>COC RSV {r.id}</strong>
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
        title="Hủy đơn đặt kho"
        confirmText="Xác nhận hủy"
        message="Bạn có chắc chắn muốn hủy đơn đặt kho này? Nếu đơn đã được gán ô kho tạm giữ (RESERVED), ô kho đó sẽ được trả về trạng thái trống (AVAILABLE)."
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  )
}

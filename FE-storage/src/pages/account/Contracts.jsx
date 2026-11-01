import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Package, CalendarDays, Receipt, RefreshCw, CreditCard, CalendarCheck, QrCode } from 'lucide-react'
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
  const [method, setMethod] = useState('BANK_TRANSFER')
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
      })

      if (payNow) {
        const list = await api.payments.forContract(renewing.id)
        const pendingRenewal = (list || []).find((p) => p.paymentType === 'RENEWAL' && p.status === 'PENDING')
        if (pendingRenewal) {
          await api.payments.markPaid(pendingRenewal.id, {
            paymentMethod: method,
            transactionReference: `RENEW-PAID-${renewing.id}-${Date.now()}`,
          })
        }
        toast(`Đã gia hạn Hợp đồng #${renewing.id} thêm ${months} tháng và xác nhận thanh toán!`)
      } else {
        toast(`Đã tạo hóa đơn gia hạn (PENDING) cho Hợp đồng #${renewing.id}. Sau khi thanh toán, ngày hết hạn sẽ tự động cộng thêm.`)
      }

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
      header: 'Mã Hợp đồng',
      render: (c) => (
        <>
          <div className="cell-title">#{c.id}</div>
          <div className="cell-sub">Từ đơn đặt chỗ #{c.reservationId}</div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Ô kho & Cơ sở',
      render: (c) => (
        <>
          <div className="cell-title">
            Ô kho {c.unitCode || c.storageUnitId}
            {c.unitTypeName ? ` (${c.unitTypeName})` : ''}
          </div>
          <div className="cell-sub">{c.facilityName || `Facility #${c.facilityId || ''}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Thời hạn hợp đồng',
      render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`,
    },
    {
      key: 'rent',
      header: 'Giá chốt trong HĐ',
      render: (c) => (
        <div>
          <div>{money(c.monthlyPrice)} / tháng</div>
          <div className="cell-sub">Tiền cọc: {money(c.depositAmount)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái HĐ',
      render: (c) => <Badge status={c.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {c.status === 'PENDING' && (
            <Button as={Link} to="/account/appointments" size="sm">
              <CalendarCheck size={14} /> Hẹn lịch Check-in
            </Button>
          )}
          {['ACTIVE', 'OVERDUE'].includes(c.status) && (
            <Button
              size="sm"
              onClick={() => {
                setRenewing(c)
                setMonths(1)
                setPayNow(true)
              }}
            >
              <RefreshCw size={14} /> Gia hạn (Renew)
            </Button>
          )}
          <Button as={Link} to={`/account/contracts/${c.id}`} size="sm" variant="secondary">
            Chi tiết HĐ
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Rental Contracts (Hợp đồng thuê kho chính thức)"
        subtitle="Bước 2: Quản lý các hợp đồng thuê kho của bạn. Hợp đồng ở trạng thái PENDING nghĩa là đang chờ bạn đặt lịch Check-in nhận kho; khi đang ACTIVE hoặc OVERDUE bạn có thể bấm Gia hạn (Renew) hoặc Đặt lịch Trả kho / Hỗ trợ kỹ thuật."
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
              title="Chưa có hợp đồng thuê kho nào"
              message="Hợp đồng (trạng thái PENDING) sẽ tự động được tạo ngay khi đơn đặt chỗ của bạn được gán kho và thanh toán tiền cọc."
            />
          }
        />
      )}

      <Modal
        open={!!renewing}
        title={renewing ? `Gia hạn Hợp đồng #${renewing.id} (Ô kho ${renewing.unitCode})` : 'Gia hạn Hợp đồng'}
        onClose={() => setRenewing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewing(null)} disabled={busy}>
              Đóng
            </Button>
            <Button loading={busy} onClick={submitRenewal}>
              {payNow ? 'Thanh toán & Gia hạn ngay' : 'Tạo hóa đơn gia hạn (PENDING)'}
            </Button>
          </>
        }
      >
        {renewing && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Ngày kết thúc hiện tại: <strong>{fmtDate(renewing.endDate)}</strong> · Đơn giá tháng:{' '}
                <strong>{money(renewing.monthlyPrice)}</strong>
              </p>
            </div>
            <Input
              label="Số tháng muốn gia hạn thêm"
              type="number"
              min="1"
              max="36"
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
            />
            <Select label="Phương thức thanh toán" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng 24/7 (VietQR)</option>
              <option value="VNPAY">Cổng VNPay QR</option>
              <option value="MOMO">Ví MoMo</option>
            </Select>
            <div className="span-2">
              <Select
                label="Tùy chọn thanh toán"
                value={payNow ? 'NOW' : 'LATER'}
                onChange={(e) => setPayNow(e.target.value === 'NOW')}
              >
                <option value="NOW">Quét QR thanh toán ngay & cộng thêm ngày kết thúc</option>
                <option value="LATER">Tạo hóa đơn PENDING & thanh toán sau tại mục Payments</option>
              </Select>
            </div>
            {payNow && (
              <div className="span-2" style={{ textAlign: 'center', background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10 }}>
                <img
                  src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${Number(renewing.monthlyPrice || 0) * Number(months || 1)}&addInfo=${encodeURIComponent(`GIA HAN HD ${renewing.id}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
                  alt="VietQR"
                  style={{ width: 150, height: 150, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
                />
                <div className="small muted" style={{ marginTop: 8 }}>
                  Phí gia hạn dự kiến: <strong>{money(Number(renewing.monthlyPrice || 0) * Number(months || 1))}</strong> (tính theo PriceRules RENEWAL)
                </div>
              </div>
            )}
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
  const [method, setMethod] = useState('BANK_TRANSFER')
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
      })
      if (payNow) {
        const list = await api.payments.forContract(id)
        const pendingRenewal = (list || []).find((p) => p.paymentType === 'RENEWAL' && p.status === 'PENDING')
        if (pendingRenewal) {
          await api.payments.markPaid(pendingRenewal.id, {
            paymentMethod: method,
            transactionReference: `RENEW-PAID-${id}-${Date.now()}`,
          })
        }
        toast('Đã gia hạn hợp đồng và xác nhận thanh toán!')
      } else {
        toast('Đã tạo hóa đơn gia hạn (PENDING). Bấm Thanh toán bên dưới để cộng thêm hạn hợp đồng.')
      }
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
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: `VIETQR-CNT-${id}-${p.id}`,
      })
      toast(`Đã thanh toán khoản #${p.id} (${label(p.paymentType)})!`)
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
    { key: 'id', header: 'Mã GD', render: (p) => `#${p.id}` },
    { key: 'type', header: 'Loại phí', render: (p) => label(p.paymentType) },
    { key: 'amount', header: 'Số tiền', render: (p) => money(p.amount) },
    { key: 'method', header: 'Phương thức', render: (p) => (p.paymentMethod ? label(p.paymentMethod) : '—') },
    { key: 'status', header: 'Trạng thái', render: (p) => <Badge status={p.status} /> },
    { key: 'date', header: 'Thời gian', render: (p) => fmtDateTime(p.paidAt || p.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        p.status === 'PENDING' && (
          <Button size="sm" loading={busy} onClick={() => settlePayment(p)}>
            <QrCode size={14} /> Thanh toán ngay
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/account/contracts">
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Danh sách hợp đồng thuê kho
          </Link>
        }
        title={`Hợp đồng thuê kho #${c.id}`}
        subtitle={`Ô kho ${c.unitCode || c.storageUnitId} tại ${c.facilityName || `Facility #${c.facilityId || ''}`}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.status === 'PENDING' && (
              <Button as={Link} to="/account/appointments">
                <CalendarCheck size={16} /> Đặt lịch Check-in nhận kho
              </Button>
            )}
            {['ACTIVE', 'OVERDUE'].includes(c.status) && (
              <>
                <Button onClick={() => setRenewOpen(true)}>
                  <RefreshCw size={16} /> Gia hạn Hợp đồng (Renew)
                </Button>
                <Button as={Link} to="/account/appointments" variant="secondary">
                  <CalendarCheck size={16} /> Đặt lịch Trả kho / Hỗ trợ
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-2" style={{ alignItems: 'start', marginBottom: 32 }}>
        <Card className="loc-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Thông tin hợp đồng</h3>
            <Badge status={c.status} />
          </div>
          <Row icon={Package} label="Ô kho vật lý">
            <strong>Ô kho {c.unitCode || `#${c.storageUnitId}`}</strong>
            {c.unitTypeName ? ` (${c.unitTypeName})` : ''}
          </Row>
          <Row icon={MapPin} label="Cơ sở">
            {c.facilityName || `Facility #${c.facilityId || ''}`}
          </Row>
          <Row icon={CalendarDays} label="Thời hạn hiệu lực">
            {fmtDate(c.startDate)} → <strong>{fmtDate(c.endDate)}</strong>
          </Row>
        </Card>

        <Card className="loc-card">
          <h3>Snapshot giá tại thời điểm ký</h3>
          <Row icon={Receipt} label="Giá thuê hàng tháng">
            <strong>{money(c.monthlyPrice)} / tháng</strong>
          </Row>
          <Row icon={CreditCard} label="Tiền cọc hợp đồng">
            <strong>{money(c.depositAmount)}</strong>
          </Row>
          <p className="muted small">
            {c.status === 'PENDING'
              ? 'Hợp đồng đang ở trạng thái PENDING (chờ nhận kho). Sau khi nhân viên hoàn tất lịch hẹn Check-in và giao chìa khóa, hợp đồng sẽ chuyển sang ACTIVE.'
              : c.status === 'OVERDUE'
                ? 'Hợp đồng đang quá hạn (OVERDUE). Vui lòng thanh toán phí quá hạn bên dưới hoặc bấm Gia hạn hợp đồng.'
                : 'Đơn giá trong hợp đồng được cố định (snapshot) tại thời điểm tạo hợp đồng.'}
          </p>
        </Card>
      </div>

      <h3 style={{ marginBottom: 16 }}>Các khoản thanh toán của hợp đồng này</h3>
      {payments.loading ? (
        <LoadingState />
      ) : payments.error ? (
        <ErrorState error={payments.error} onRetry={payments.reload} />
      ) : (
        <DataTable
          columns={payCols}
          rows={payments.data || []}
          rowKey="id"
          empty={<EmptyState title="Chưa có giao dịch thanh toán nào gắn với hợp đồng này" />}
        />
      )}

      <Modal
        open={renewOpen}
        title={`Gia hạn Hợp đồng #${c.id}`}
        onClose={() => setRenewOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewOpen(false)} disabled={busy}>
              Hủy
            </Button>
            <Button loading={busy} onClick={handleRenew}>
              {payNow ? 'Thanh toán & Gia hạn ngay' : 'Tạo hóa đơn gia hạn'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Input
            label="Số tháng gia hạn thêm"
            type="number"
            min="1"
            max="36"
            value={months}
            onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
          />
          <Select label="Phương thức thanh toán" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng 24/7 (VietQR)</option>
            <option value="VNPAY">Cổng VNPay QR</option>
            <option value="MOMO">Ví MoMo</option>
          </Select>
          <div className="span-2">
            <Select
              label="Tùy chọn thanh toán"
              value={payNow ? 'NOW' : 'LATER'}
              onChange={(e) => setPayNow(e.target.value === 'NOW')}
            >
              <option value="NOW">Quét QR thanh toán ngay & cộng thêm ngày kết thúc</option>
              <option value="LATER">Tạo hóa đơn PENDING & thanh toán sau</option>
            </Select>
          </div>
        </div>
      </Modal>
    </>
  )
}

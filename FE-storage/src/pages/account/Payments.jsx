import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, QrCode } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, Select, Input, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { money, fmtDateTime, label } from '../../utils/format.js'

export default function Payments() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.payments.my())
  const [payingItem, setPayingItem] = useState(null)
  const [method, setMethod] = useState('BANK_TRANSFER')
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
        transactionReference: reference || `${method}-${payingItem.id}-${Date.now()}`,
      })
      toast(`Đã thanh toán khoản #${payingItem.id} (${label(payingItem.paymentType)}) thành công!`)
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
      header: 'Mã GD',
      render: (p) => (
        <>
          <div className="cell-title">#{p.id}</div>
          <div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Loại khoản thu',
      render: (p) => (
        <>
          <div className="cell-title">{label(p.paymentType)}</div>
          <div className="cell-sub">
            {[p.unitCode && `Ô kho ${p.unitCode}`, p.facilityName].filter(Boolean).join(' · ') ||
              (p.rentalContractId ? `Hợp đồng #${p.rentalContractId}` : p.reservationId ? `Đơn đặt kho #${p.reservationId}` : '')}
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Số tiền',
      render: (p) => <strong>{money(p.amount)}</strong>,
    },
    {
      key: 'method',
      header: 'Phương thức',
      render: (p) => (p.paymentMethod ? label(p.paymentMethod) : <span className="muted">Chờ chọn cổng TT</span>),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (p) => <Badge status={p.status} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      className: 'actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {p.status === 'PENDING' && (
            <Button
              size="sm"
              onClick={() => {
                setPayingItem(p)
                setMethod(p.paymentMethod || 'BANK_TRANSFER')
                setReference('')
              }}
            >
              <QrCode size={14} /> Quét QR Thanh toán
            </Button>
          )}
          {p.rentalContractId ? (
            <Button as={Link} to={`/account/contracts/${p.rentalContractId}`} size="sm" variant="secondary">
              Hợp đồng #{p.rentalContractId}
            </Button>
          ) : p.reservationId ? (
            <Button as={Link} to={`/account/reservations/${p.reservationId}`} size="sm" variant="secondary">
              Đơn #{p.reservationId}
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Payments & Billing (Thanh toán & Lịch sử giao dịch)"
        subtitle="Thanh toán các khoản phí đang chờ (Tiền cọc, Tiền thuê, Phí gia hạn, Phí quá hạn, Phụ phí, Phí đền bù hư hại kho) qua VietQR / VNPay / MoMo."
      />

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        <Card className="stat-card">
          <div className="stat-label">
            <Clock size={18} /> Khoản cần thanh toán ({pendingRows.length} hóa đơn PENDING)
          </div>
          <div className="stat-num">{money(pendingTotal)}</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-label">
            <CheckCircle2 size={18} /> Đã thanh toán ({paidRows.length} giao dịch PAID)
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
              title="Chưa có giao dịch thanh toán nào"
              message="Các hóa đơn tiền cọc, gia hạn, phí quá hạn hoặc phí hư hại kho sẽ hiển thị tại đây."
            />
          }
        />
      )}

      <Modal
        open={!!payingItem}
        title={payingItem ? `Thanh toán hóa đơn #${payingItem.id} (${label(payingItem.paymentType)})` : 'Thanh toán hóa đơn'}
        onClose={() => setPayingItem(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingItem(null)} disabled={busy}>
              Đóng
            </Button>
            <Button loading={busy} onClick={submitPay}>
              Xác nhận đã chuyển {payingItem ? money(payingItem.amount) : ''}
            </Button>
          </>
        }
      >
        {payingItem && (
          <div className="form-grid">
            <div className="span-2">
              <Select label="Cổng thanh toán online" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng 24/7 (VietQR)</option>
                <option value="VNPAY">Cổng VNPay QR</option>
                <option value="MOMO">Ví điện tử MoMo</option>
              </Select>
            </div>
            <div className="span-2" style={{ textAlign: 'center', background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10 }}>
              <img
                src={`https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${payingItem.amount || 100000}&addInfo=${encodeURIComponent(`PAY ${payingItem.id} ${payingItem.paymentType}`)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`}
                alt="VietQR"
                style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto', borderRadius: 8 }}
              />
              <div className="small muted" style={{ marginTop: 8 }}>
                Số tiền: <strong>{money(payingItem.amount)}</strong> · Nội dung: <strong>PAY {payingItem.id} {payingItem.paymentType}</strong>
              </div>
            </div>
            <div className="span-2">
              <Input
                label="Mã giao dịch ngân hàng (tùy chọn)"
                placeholder="VD: FT26305123456"
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

import { useState } from 'react'
import { QrCode, Building2, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDateTime, money } from '../../utils/format.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
]

const TYPE_VI = {
  DEPOSIT: 'Tiền đặt cọc (Đợt 1 - 50%)',
  RENTAL: 'Tiền thuê kho (Đợt 2 - 100%)',
  RENEWAL: 'Phí gia hạn hợp đồng',
  OVERDUE_FEE: 'Phí phạt quá hạn',
  EXTRA_FEE: 'Phụ phí phát sinh',
  DAMAGE_FEE: 'Phí đền bù hư hại',
}

const STATUS_VI = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  REFUNDED: 'Đã hoàn tiền',
  FAILED: 'Đã hủy',
}

const METHOD_VI = {
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  VNPAY: 'VNPay QR',
  MOMO: 'Ví MoMo',
  CARD: 'Thẻ ngân hàng',
  CASH: 'Tiền mặt tại quầy',
}

// Ẩn số thứ tự tự tăng #1, #2, #3, #4
const maskPayCode = (p) => {
  const n = Number(p?.id || 1)
  const hash = ((n * 5843 + 301927) % 899999) + 100000
  return `GD-${hash}`
}

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
      await api.payments.submitReference(activePay.id, {
        paymentMethod: method,
        transactionReference: refCode || `${method}-${maskPayCode(activePay)}`,
      })
      toast(`Đã ghi nhận thông tin chuyển khoản cho hóa đơn ${maskPayCode(activePay)}! Nhân viên/Quản lý sẽ kiểm tra và xác nhận đã thu tiền.`)
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
      key: 'code',
      header: 'Mã giao dịch',
      render: (p) => (
        <>
          <div className="cell-title">{maskPayCode(p)}</div>
          <div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Nội dung thanh toán',
      render: (p) => {
        const ref = p.transactionReference || ''
        const isRefund80 = ref.startsWith('HOAN_COC_80%')
        const isRefund100 = ref.startsWith('HOAN_COC_100%')
        const isRefundAfterDamage = ref.startsWith('HOAN_COC_SAU_TRU_HU_HAI')
        const isForfeited = ref.startsWith('MAT_100%_COC') || ref.startsWith('KHAU_TRU_100%_COC')
        return (
          <div>
            <strong>{TYPE_VI[p.paymentType] || p.paymentType}</strong>
            <div className="cell-sub">
              {[p.facilityName, p.unitCode && `Ô kho ${p.unitCode}`].filter(Boolean).join(' · ') || 'Giao dịch thuê kho'}
            </div>
            {isRefund100 && <div className="small" style={{ color: '#15803d', fontWeight: 600 }}>Hoàn trả 100% tiền cọc</div>}
            {isRefund80 && <div className="small" style={{ color: '#b45309', fontWeight: 600 }}>Hoàn trả 80% cọc (Khấu trừ 20% do hủy trong 10 ngày cuối)</div>}
            {isRefundAfterDamage && <div className="small" style={{ color: '#b45309', fontWeight: 600 }}>Hoàn trả cọc sau khi khấu trừ phí hư hại khi trả kho</div>}
            {isForfeited && <div className="small" style={{ color: '#b91c1c', fontWeight: 600 }}>Khấu trừ / mất 100% tiền cọc</div>}
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Số tiền',
      render: (p) => {
        const ref = p.transactionReference || ''
        if (p.status === 'REFUNDED' && ref.includes(':')) {
          const refundedVal = Number(ref.split(':')[1])
          return (
            <div>
              <strong>{money(p.amount)}</strong>
              {!Number.isNaN(refundedVal) && (
                <div className="cell-sub" style={{ color: '#15803d', fontWeight: 600 }}>
                  Thực nhận hoàn: {money(refundedVal)}
                </div>
              )}
            </div>
          )
        }
        return <strong>{money(p.amount)}</strong>
      },
    },
    {
      key: 'method',
      header: 'Phương thức',
      render: (p) => (p.paymentMethod ? METHOD_VI[p.paymentMethod] || p.paymentMethod : 'Chưa chọn'),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (p) => (
        <Badge status={p.status}>
          {STATUS_VI[p.status] || p.status}
        </Badge>
      ),
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
            <QrCode size={14} /> Quét QR / Gửi mã CK
          </Button>
        ),
    },
  ]

  const qrMemo = activePay ? `THANH TOAN ${maskPayCode(activePay)}` : ''
  const vietQrUrl = activePay
    ? `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${activePay.amount}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`
    : ''

  return (
    <>
      <PageHeader
        title="Lịch Sử Giao Dịch & Thanh Toán"
        subtitle="Theo dõi các hóa đơn Đợt 1 (Đặt cọc 50%), Đợt 2 (Tiền thuê kho 100%), phí gia hạn và trạng thái hoàn tiền cọc."
      />

      <Card style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <Select label="Lọc theo trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_VI[s] || s}</option>
            ))}
          </Select>
          <Select label="Lọc theo loại giao dịch" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tất cả loại giao dịch</option>
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_VI[t] || t}</option>
            ))}
          </Select>
        </div>
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty={<EmptyState title="Chưa có giao dịch thanh toán nào" message="Các hóa đơn đặt cọc và thuê kho của bạn sẽ hiển thị tại đây." />}
        />
      )}

      <Modal
        open={!!activePay}
        title={activePay ? `Thanh toán hóa đơn ${maskPayCode(activePay)}` : 'Thanh toán'}
        onClose={() => setActivePay(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActivePay(null)} disabled={busy}>
              Đóng
            </Button>
            <Button loading={busy} onClick={confirmPay}>
              <CheckCircle2 size={16} /> Gửi thông tin chuyển khoản ({activePay ? money(activePay.amount) : ''})
            </Button>
          </>
        }
      >
        {activePay && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Khoản thu: <strong>{TYPE_VI[activePay.paymentType] || activePay.paymentType}</strong> · Số tiền:{' '}
                <strong>{money(activePay.amount)}</strong>
              </p>
            </div>
            <div className="span-2">
              <Select label="Chọn cổng thanh toán" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.text}</option>
                ))}
              </Select>
            </div>
            <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <img
                  src={vietQrUrl}
                  alt="VietQR"
                  style={{ width: 140, height: 140, objectFit: 'contain', background: '#fff', padding: 6, borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                    <Building2 size={16} /> Quét mã VietQR / {METHOD_VI[method] || method}
                  </div>
                  <div className="small muted">Ngân hàng: <strong>MB Bank (Ngân hàng Quân Đội)</strong></div>
                  <div className="small muted">Chủ tài khoản: <strong>SAFESPACE STORAGE</strong></div>
                  <div className="small muted">Số tiền: <strong>{money(activePay.amount)}</strong></div>
                  <div className="small muted">Nội dung CK: <strong>{qrMemo}</strong></div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Input
                  label="Mã giao dịch ngân hàng (tùy chọn)"
                  placeholder="VD: FT26305112233"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

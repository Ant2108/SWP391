import { useState } from 'react'
import { QrCode, CheckCircle2, FileText } from 'lucide-react'
import BankQrPay from '../../components/BankQrPay.jsx'
import InvoiceModal from '../../components/InvoiceModal.jsx'
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
  DEPOSIT: 'Tiền đặt cọc (Đợt 1)',
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
  const [invoiceId, setInvoiceId] = useState(null)
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
        transactionReference: refCode || `${method}-${maskPayCode(activePay)}`,
      })
      toast(`Đã thanh toán thành công hóa đơn ${maskPayCode(activePay)} (${money(activePay.amount)})!`)
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
        const hasRefund = p.refundAmount != null
        const ded = Number(p.deductionAmount || 0)
        return (
          <div>
            <strong>{(p.transactionReference || '').startsWith('TRE_DOT_2') ? 'Phí trễ hạn đóng tiền thuê Đợt 2' : (TYPE_VI[p.paymentType] || p.paymentType)}</strong>
            <div className="cell-sub">
              {[p.facilityName, p.unitCode && `Ô kho ${p.unitCode}`].filter(Boolean).join(' · ') || 'Giao dịch thuê kho'}
            </div>
            {hasRefund && ded === 0 && <div className="small" style={{ color: '#15803d', fontWeight: 600 }}>Hoàn đủ tiền cọc</div>}
            {hasRefund && ded > 0 && Number(p.refundAmount) > 0 && (
              <div className="small" style={{ color: '#b45309', fontWeight: 600 }}>Hoàn cọc sau khi khấu trừ {money(ded)}</div>
            )}
            {hasRefund && Number(p.refundAmount) === 0 && (
              <div className="small" style={{ color: '#b91c1c', fontWeight: 600 }}>Khấu trừ toàn bộ tiền cọc</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Số tiền',
      render: (p) => {
        if (p.refundAmount != null) {
          return (
            <div>
              <strong>{money(p.amount)}</strong>
              <div className="cell-sub" style={{ color: '#15803d', fontWeight: 600 }}>
                Hoàn lại: {money(p.refundAmount)} {p.refundedAt ? '(đã chuyển khoản)' : '(chờ chuyển khoản)'}
              </div>
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
          {p.waivedAt ? 'Đã miễn' : (STATUS_VI[p.status] || p.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setInvoiceId(p.id)}>
            <FileText size={14} /> Xem hóa đơn
          </Button>
          {p.status === 'PENDING' && (
            <Button
              size="sm"
              onClick={() => {
                setActivePay(p)
                setMethod(p.paymentMethod && p.paymentMethod !== 'CASH' ? p.paymentMethod : 'BANK_TRANSFER')
                setRefCode('')
              }}
            >
              <QrCode size={14} /> Quét QR / Thanh toán ngay
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Lịch Sử Giao Dịch & Thanh Toán"
        subtitle="Theo dõi các hóa đơn Đợt 1 (Đặt cọc), Đợt 2 (Tiền thuê kho 100%), phí gia hạn và trạng thái hoàn tiền cọc."
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

      <InvoiceModal paymentId={invoiceId} onClose={() => setInvoiceId(null)} />

      <Modal
        wide
        open={!!activePay}
        title={activePay ? `Thanh toán hóa đơn ${maskPayCode(activePay)}` : 'Thanh toán'}
        onClose={() => setActivePay(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActivePay(null)} disabled={busy}>
              Đóng
            </Button>
            {/* Nút thử nghiệm: giả lập thanh toán nhanh trong lúc test các phần khác. Sẽ bỏ khi chạy thật. */}
            <Button variant="secondary" loading={busy} onClick={confirmPay}>
              <CheckCircle2 size={16} /> [Demo] Giả lập đã thanh toán
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
              <BankQrPay
                payment={activePay}
                onPaid={() => {
                  toast(`Đã nhận được tiền cho hóa đơn ${maskPayCode(activePay)} (${money(activePay.amount)}). Cảm ơn quý khách!`)
                  setActivePay(null)
                  reload()
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

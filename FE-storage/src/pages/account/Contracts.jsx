import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, CreditCard, QrCode, Building2, FileText, PenTool, Printer, Eraser, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, CONTRACT_STATUSES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
]

const STATUS_VI = {
  PENDING: 'Chờ nhận kho (Chờ kích hoạt)',
  ACTIVE: 'Đang thuê (Đang hiệu lực)',
  OVERDUE: 'Quá hạn thanh toán',
  COMPLETED: 'Đã thanh lý & Hoàn cọc',
  CANCELLED: 'Đã hủy',
}

const PAY_TYPE_VI = {
  DEPOSIT: 'Tiền đặt cọc (Đợt 1 - 50%)',
  RENTAL: 'Tiền thuê kho (Đợt 2 - 100%)',
  RENEWAL: 'Phí gia hạn hợp đồng',
  OVERDUE_FEE: 'Phí phạt quá hạn',
  EXTRA_FEE: 'Phụ phí phát sinh',
  DAMAGE_FEE: 'Phí đền bù hư hại',
}

const PAY_STATUS_VI = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  REFUNDED: 'Đã hoàn tiền',
  FAILED: 'Đã hủy',
}

// Ẩn số thứ tự tự tăng #1, #2, #3, #4
const maskContractCode = (c) => {
  const n = Number(c?.id || 1)
  const hash = ((n * 6971 + 203459) % 899999) + 100000
  return `HĐ-${hash}`
}

const SIG_STORAGE_KEY = 'safespace_contract_signatures_v1'
function loadSignatures() {
  try {
    return JSON.parse(localStorage.getItem(SIG_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveSignature(contractId, sigData) {
  try {
    const all = loadSignatures()
    all[String(contractId)] = sigData
    localStorage.setItem(SIG_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore storage errors
  }
}

export default function Contracts() {
  const { user } = useAuth()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.rentalContracts.my())

  // Modal Gia hạn hợp đồng
  const [renewTarget, setRenewTarget] = useState(null)
  const [months, setMonths] = useState(1)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [payNow, setPayNow] = useState(true)
  const [transferRef, setTransferRef] = useState('')
  const [busy, setBusy] = useState(false)

  // Modal Lịch sử hóa đơn của hợp đồng
  const [invoiceTarget, setInvoiceTarget] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  // Modal Hợp đồng Online & Ký tên điện tử
  const [onlineContract, setOnlineContract] = useState(null)
  const [signatures, setSignatures] = useState(() => loadSignatures())
  const [signerName, setSignerName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    if (!invoiceTarget) {
      setInvoices([])
      return
    }
    setLoadingInvoices(true)
    api.payments
      .forContract(invoiceTarget.id)
      .then((list) => setInvoices(list || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingInvoices(false))
  }, [invoiceTarget])

  useEffect(() => {
    if (onlineContract) {
      const existing = signatures[String(onlineContract.id)]
      setSignerName(existing?.signerName || onlineContract.customerName || user?.fullname || 'Khách hàng thuê kho')
      setHasDrawn(false)
      setTimeout(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.strokeStyle = '#1e3a8a'
        ctx.lineWidth = 2.4
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }, 60)
    }
  }, [onlineContract])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawingRef.current = true
    setHasDrawn(true)
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const moveDraw = (e) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (e.cancelable) e.preventDefault()
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => {
    drawingRef.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const confirmDigitalSignature = () => {
    if (!onlineContract) return
    if (!hasDrawn) {
      toast('Vui lòng dùng chuột hoặc ngón tay ký tên vào khung chữ ký Bên B trước khi xác nhận!', 'error')
      return
    }
    const canvas = canvasRef.current
    const dataUrl = canvas ? canvas.toDataURL('image/png') : ''
    const payload = {
      dataUrl,
      signerName: (signerName || onlineContract.customerName || 'Khách hàng').trim(),
      signedAt: new Date().toISOString(),
    }
    saveSignature(onlineContract.id, payload)
    setSignatures(loadSignatures())
    toast(`Đã ký Hợp đồng điện tử ${maskContractCode(onlineContract)} thành công!`)
  }

  const allRows = data || []
  const rows = statusFilter ? allRows.filter((c) => c.status === statusFilter) : allRows

  const submitRenewal = async () => {
    if (!renewTarget) return
    setBusy(true)
    try {
      await api.rentalContracts.renew(renewTarget.id, {
        months: Number(months),
        paymentMethod: method,
        paid: false,
      })

      if (payNow) {
        const contractPayments = await api.payments.forContract(renewTarget.id)
        const pendingRenewal = (contractPayments || []).find(
          (p) => p.paymentType === 'RENEWAL' && p.status === 'PENDING'
        )
        if (pendingRenewal) {
          await api.payments.markPaid(pendingRenewal.id, {
            paymentMethod: method,
            transactionReference: transferRef || `${method}-RENEW-${maskContractCode(renewTarget)}`,
          })
        }
        toast(`Đã gia hạn hợp đồng ${maskContractCode(renewTarget)} thêm ${months} tháng và thanh toán thành công!`)
      } else {
        toast(`Đã tạo hóa đơn gia hạn (Chờ thanh toán) cho hợp đồng ${maskContractCode(renewTarget)}.`)
      }

      setRenewTarget(null)
      setTransferRef('')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const payContractInvoice = async (payment) => {
    setBusy(true)
    try {
      await api.payments.markPaid(payment.id, {
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: `VIETQR-INV-${payment.id}`,
      })
      toast('Thanh toán hóa đơn thành công!')
      const updated = await api.payments.forContract(invoiceTarget.id)
      setInvoices(updated || [])
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
      header: 'Mã hợp đồng',
      render: (c) => {
        const signed = !!signatures[String(c.id)]
        return (
          <>
            <div className="cell-title">{maskContractCode(c)}</div>
            <div style={{ marginTop: 4 }}>
              <Badge tone={signed ? 'green' : 'amber'}>
                {signed ? 'Đã ký Online' : 'Chờ ký Online'}
              </Badge>
            </div>
          </>
        )
      },
    },
    {
      key: 'unit',
      header: 'Ô kho & Cơ sở',
      render: (c) => (
        <>
          <div className="cell-title">
            {c.unitTypeName ? `${c.unitTypeName} · ` : ''}Ô kho {c.unitCode || 'Đang gán'}
          </div>
          <div className="cell-sub">{c.facilityName || 'Cơ sở kho'}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Thời hạn thuê',
      render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`,
    },
    {
      key: 'price',
      header: 'Giá thuê / Tháng',
      render: (c) => money(c.monthlyPrice),
    },
    {
      key: 'deposit',
      header: 'Tiền cọc hoàn cuối kỳ',
      render: (c) => (
        <div>
          <strong>{money(c.depositAmount)}</strong>
          <div className="cell-sub">
            {c.status === 'COMPLETED' ? 'Đã hoàn trả sau khi hết hạn' : 'Hoàn trả khi kết thúc hợp đồng'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (c) => (
        <>
          <Badge status={c.status}>{STATUS_VI[c.status] || c.status}</Badge>
          {c.overdue && c.status !== 'OVERDUE' && (
            <div style={{ marginTop: 4 }}>
              <Badge status="OVERDUE">Quá hạn</Badge>
            </div>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            onClick={() => setOnlineContract(c)}
          >
            <PenTool size={14} /> {signatures[String(c.id)] ? 'Xem HĐ Online' : 'Ký HĐ Online'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setInvoiceTarget(c)}
          >
            <CreditCard size={14} /> Hóa đơn & Đợt 2
          </Button>
          {['ACTIVE', 'OVERDUE'].includes(c.status) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRenewTarget(c)
                setMonths(1)
                setMethod('BANK_TRANSFER')
                setPayNow(true)
              }}
            >
              <CalendarPlus size={14} /> Gia hạn
            </Button>
          )}
        </div>
      ),
    },
  ]

  const renewEstimate = renewTarget ? Number(renewTarget.monthlyPrice || 0) * Number(months) : 0
  const qrMemo = renewTarget ? `GIA HAN ${maskContractCode(renewTarget)} ${months}T` : ''
  const vietQrUrl = renewTarget
    ? `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${renewEstimate}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`
    : ''

  const currentSig = onlineContract ? signatures[String(onlineContract.id)] : null

  return (
    <>
      <PageHeader
        title="Hợp Đồng Thuê Kho Điện Tử"
        subtitle="Xem, ký tên điện tử trực tiếp trên Hợp đồng thuê kho Online, thanh toán Đợt 2 (100% tiền thuê kho) và gia hạn hợp đồng."
        actions={
          <Button as={Link} to="/account/appointments" variant="secondary">
            Xem lịch nhận kho
          </Button>
        }
      />

      <Card style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <Select label="Lọc theo trạng thái hợp đồng" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_VI[s] || s}</option>
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
          empty={
            <EmptyState
              title="Chưa có hợp đồng thuê kho nào"
              message="Hợp đồng thuê kho điện tử sẽ tự động được tạo ngay khi đơn đặt chỗ của bạn được gán ô kho."
            />
          }
        />
      )}

      {/* Modal Hợp đồng Thuê Kho Online & Chữ ký điện tử */}
      <Modal
        open={!!onlineContract}
        title={onlineContract ? `Hợp Đồng Thuê Kho Điện Tử (${maskContractCode(onlineContract)})` : 'Hợp đồng Online'}
        onClose={() => setOnlineContract(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> In / Lưu PDF Hợp đồng
            </Button>
            <Button variant="secondary" onClick={() => setOnlineContract(null)}>
              Đóng
            </Button>
          </>
        }
      >
        {onlineContract && (
          <div style={{ background: '#fff', color: '#1e293b', padding: '16px 20px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ textAlign: 'center', borderBottom: '2px double #334155', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>
                CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Độc lập – Tự do – Hạnh phúc
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginTop: 6 }}>
                HỢP ĐỒNG CHO THUÊ KHO LƯU TRỮ TRỰC TUYẾN
              </div>
              <div className="small muted">
                Số hợp đồng: <strong>{maskContractCode(onlineContract)}</strong> · Ngày lập: <strong>{fmtDate(onlineContract.createdAt || onlineContract.startDate)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>BÊN CHO THUÊ KHO (BÊN A): CÔNG TY TNHH HỆ THỐNG KHO TỰ QUẢN SAFESPACE</strong>
              <div>Cơ sở quản lý: <strong>{onlineContract.facilityName || 'Hệ thống kho SafeSpace'}</strong></div>
              <div>Đại diện pháp lý: <strong>Ban Quản Lý Vận Hành Kho SafeSpace</strong> · Chức vụ: Giám đốc vận hành</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>BÊN THUÊ KHO (BÊN B): KHÁCH HÀNG CÁ NHÂN / TỔ CHỨC</strong>
              <div>Họ và tên người thuê: <strong>{onlineContract.customerName || user?.fullname || 'Khách hàng'}</strong></div>
              <div>Email đăng ký tài khoản: <strong>{user?.email || 'Đã xác thực trên hệ thống'}</strong></div>
            </div>

            <div style={{ marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <strong>ĐIỀU 1: ĐỐI TƯỢNG & THỜI HẠN THUÊ KHO</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Ô kho bàn giao: <strong>Ô kho {onlineContract.unitCode}</strong> ({onlineContract.unitTypeName || 'Tiêu chuẩn'}) tại <strong>{onlineContract.facilityName}</strong>.</li>
                <li>Thời gian thuê: Từ ngày <strong>{fmtDate(onlineContract.startDate)}</strong> đến hết ngày <strong>{fmtDate(onlineContract.endDate)}</strong>.</li>
                <li>Trạng thái hợp đồng hiện tại: <strong>{STATUS_VI[onlineContract.status] || onlineContract.status}</strong>.</li>
              </ul>
            </div>

            <div style={{ marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <strong>ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG & PHƯƠNG THỨC THANH TOÁN 2 ĐỢT</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Đơn giá thuê hàng tháng: <strong>{money(onlineContract.monthlyPrice)} / tháng</strong>.</li>
                <li>Tiền đặt cọc bảo đảm hợp đồng (Đợt 1 - 50%): <strong>{money(onlineContract.depositAmount)}</strong>.</li>
                <li>Thanh toán tiền thuê kho (Đợt 2 - 100% giá trị kho): Thanh toán đầy đủ khi nhận bàn giao kho.</li>
              </ul>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13 }}>
              <strong>ĐIỀU 3: ĐIỀU KHOẢN HOÀN TRẢ & KHẤU TRỪ TIỀN ĐẶT CỌC</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Nếu Bên B hủy đặt chỗ trước hạn nhận kho hơn 10 ngày: Bên A hoàn trả ngay 100% tiền cọc.</li>
                <li>Nếu Bên B hủy hoặc nhận kho trong vòng 10 ngày cuối trước hạn chót 1 tháng: Khấu trừ 20% tiền cọc, số tiền cọc còn lại (80%) là <strong>{money(onlineContract.depositAmount)}</strong>.</li>
                <li>Khi hết hạn hợp đồng thuê kho và Bên B bàn giao lại kho nguyên trạng, Bên A hoàn trả toàn bộ số tiền cọc <strong>{money(onlineContract.depositAmount)}</strong> cho Bên B.</li>
              </ul>
            </div>

            {/* Khu vực chữ ký 2 bên */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, paddingTop: 14, borderTop: '1px solid #cbd5e1' }}>
              {/* Chữ ký Bên A */}
              <div style={{ textAlign: 'center', padding: 12, border: '1px dashed #94a3b8', borderRadius: 8, background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>ĐẠI DIỆN BÊN A (SAFESPACE)</div>
                <div className="small muted">(Ký tên & Đóng dấu điện tử)</div>
                <div style={{ margin: '14px auto', width: 135, padding: '8px 6px', border: '2px solid #dc2626', color: '#dc2626', borderRadius: 6, fontWeight: 700, fontSize: 11, transform: 'rotate(-4deg)', background: 'rgba(254,226,226,0.35)' }}>
                  ĐÃ KÝ SỐ BỞI<br />CÔNG TY TNHH<br />SAFESPACE STORAGE
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Ban Quản Lý SafeSpace</div>
              </div>

              {/* Chữ ký Bên B (Khách hàng ký trực tiếp) */}
              <div style={{ textAlign: 'center', padding: 12, border: '1px dashed #94a3b8', borderRadius: 8, background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>ĐẠI DIỆN BÊN B (KHÁCH HÀNG)</div>
                <div className="small muted">(Ký điện tử xác nhận hợp đồng)</div>

                {currentSig ? (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={currentSig.dataUrl}
                      alt="Chữ ký khách hàng"
                      style={{ maxHeight: 85, maxWidth: '100%', objectFit: 'contain', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4 }}
                    />
                    <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginTop: 4 }}>
                      <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {currentSig.signerName}
                    </div>
                    <div className="small muted">Đã ký lúc: {fmtDateTime(currentSig.signedAt)}</div>
                    <Button
                      size="sm"
                      variant="secondary"
                      style={{ marginTop: 6 }}
                      onClick={() => {
                        const all = loadSignatures()
                        delete all[String(onlineContract.id)]
                        localStorage.setItem(SIG_STORAGE_KEY, JSON.stringify(all))
                        setSignatures(loadSignatures())
                      }}
                    >
                      Ký lại chữ ký mới
                    </Button>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <canvas
                      ref={canvasRef}
                      width={260}
                      height={100}
                      onMouseDown={startDraw}
                      onMouseMove={moveDraw}
                      onMouseUp={endDraw}
                      onMouseLeave={endDraw}
                      onTouchStart={startDraw}
                      onTouchMove={moveDraw}
                      onTouchEnd={endDraw}
                      style={{
                        width: '100%',
                        height: 95,
                        background: '#ffffff',
                        border: '1px solid #94a3b8',
                        borderRadius: 6,
                        cursor: 'crosshair',
                        touchAction: 'none',
                      }}
                    />
                    <div style={{ marginTop: 6 }}>
                      <Input
                        label="Họ và tên người ký"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                      <Button size="sm" variant="secondary" onClick={clearCanvas}>
                        <Eraser size={14} /> Xóa nét
                      </Button>
                      <Button size="sm" onClick={confirmDigitalSignature}>
                        <PenTool size={14} /> Xác nhận ký HĐ
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Hóa đơn & Thanh toán Đợt 2 của Hợp đồng */}
      <Modal
        open={!!invoiceTarget}
        title={invoiceTarget ? `Hóa đơn của Hợp đồng ${maskContractCode(invoiceTarget)} (Ô ${invoiceTarget.unitCode})` : 'Hóa đơn hợp đồng'}
        onClose={() => setInvoiceTarget(null)}
        footer={
          <Button variant="secondary" onClick={() => setInvoiceTarget(null)}>
            Đóng
          </Button>
        }
      >
        {loadingInvoices ? (
          <LoadingState />
        ) : invoices.length === 0 ? (
          <p className="muted">Chưa có hóa đơn nào gắn với hợp đồng này.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {PAY_TYPE_VI[inv.paymentType] || inv.paymentType} · {money(inv.amount)}
                  </div>
                  <div className="small muted">{fmtDateTime(inv.paidAt || inv.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status={inv.status}>{PAY_STATUS_VI[inv.status] || inv.status}</Badge>
                  {inv.status === 'PENDING' && (
                    <Button size="sm" loading={busy} onClick={() => payContractInvoice(inv)}>
                      <QrCode size={14} /> Thanh toán ngay
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Gia hạn hợp đồng */}
      <Modal
        open={!!renewTarget}
        title={renewTarget ? `Gia hạn Hợp đồng ${maskContractCode(renewTarget)} (Ô ${renewTarget.unitCode})` : 'Gia hạn Hợp đồng'}
        onClose={() => setRenewTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewTarget(null)} disabled={busy}>
              Hủy
            </Button>
            <Button loading={busy} onClick={submitRenewal}>
              {payNow ? `Thanh toán & Gia hạn (${money(renewEstimate)})` : 'Gửi yêu cầu gia hạn'}
            </Button>
          </>
        }
      >
        {renewTarget && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Ngày kết thúc hiện tại: <strong>{fmtDate(renewTarget.endDate)}</strong> · Giá thuê hàng tháng:{' '}
                <strong>{money(renewTarget.monthlyPrice)}</strong>
              </p>
            </div>
            <Select label="Số tháng muốn gia hạn thêm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map((m) => (
                <option key={m} value={m}>{m} tháng</option>
              ))}
            </Select>
            <Select label="Phương thức thanh toán" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.text}</option>
              ))}
            </Select>
            <div className="span-2">
              <Select
                label="Xác nhận thanh toán"
                value={payNow ? 'YES' : 'NO'}
                onChange={(e) => setPayNow(e.target.value === 'YES')}
              >
                <option value="YES">Thanh toán online ngay ({money(renewEstimate)}) — Tự động cộng thêm tháng</option>
                <option value="NO">Chỉ tạo hóa đơn chờ thanh toán</option>
              </Select>
            </div>
            {payNow && (
              <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img
                    src={vietQrUrl}
                    alt="VietQR Renewal"
                    style={{ width: 130, height: 130, objectFit: 'contain', background: '#fff', padding: 6, borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                      <Building2 size={16} /> Quét mã VietQR gia hạn
                    </div>
                    <div className="small muted">Ngân hàng: <strong>MB Bank</strong> · <strong>SAFESPACE STORAGE</strong></div>
                    <div className="small muted">Số tiền gia hạn: <strong>{money(renewEstimate)}</strong></div>
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
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

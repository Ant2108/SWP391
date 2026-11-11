import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, CreditCard, QrCode, Building2, PenTool, Printer, Eraser, CheckCircle2, ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, CONTRACT_STATUSES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import { CONTRACT_STATUS_VI, maskContractCode, officialContractNumber, openContractInNewPage, parseRenewalMonths, sortRenewalsAscending } from '../../utils/contractDocument.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
]

const STATUS_VI = CONTRACT_STATUS_VI

const PAY_TYPE_VI = {
  DEPOSIT: 'Tiền đặt cọc (Đợt 1)',
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

  // Trang xem & ký Hợp đồng Online chuẩn khổ A4 (đồng bộ trực tiếp từ Backend)
  const [onlineContract, setOnlineContract] = useState(null)
  const [onlineRenewals, setOnlineRenewals] = useState([])
  const [signerName, setSignerName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signing, setSigning] = useState(false)
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
    if (!onlineContract) {
      setOnlineRenewals([])
      return
    }
    api.payments
      .forContract(onlineContract.id)
      .then((list) => setOnlineRenewals(sortRenewalsAscending((list || []).filter((p) => p.paymentType === 'RENEWAL'))))
      .catch(() => setOnlineRenewals([]))
  }, [onlineContract])

  useEffect(() => {
    if (onlineContract) {
      setSignerName(onlineContract.signerName || onlineContract.customerName || user?.fullname || 'Khách hàng thuê kho')
      setHasDrawn(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.strokeStyle = '#1e3a8a'
        ctx.lineWidth = 2.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }, 60)
    }
  }, [onlineContract, user?.fullname])

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

  const confirmDigitalSignature = async () => {
    if (!onlineContract) return
    if (!hasDrawn) {
      toast('Vui lòng dùng chuột hoặc ngón tay ký tên vào khung chữ ký Bên B trước khi xác nhận!', 'error')
      return
    }
    const canvas = canvasRef.current
    const dataUrl = canvas ? canvas.toDataURL('image/png') : ''
    setSigning(true)
    try {
      const updated = await api.rentalContracts.sign(onlineContract.id, {
        signerName: (signerName || onlineContract.customerName || 'Khách hàng').trim(),
        signatureUrl: dataUrl,
      })
      setOnlineContract(updated)
      reload()
      toast(`Đã ký Hợp đồng điện tử ${maskContractCode(onlineContract)} thành công! Bạn có thể bấm "Xuất PDF / In Hợp đồng" ngay.`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSigning(false)
    }
  }

  const handleOpenOrPrintContract = async (autoPrint = false) => {
    if (!onlineContract) return
    const draftSig = !onlineContract.signatureUrl && hasDrawn && canvasRef.current
      ? canvasRef.current.toDataURL('image/png')
      : ''
    openContractInNewPage(onlineContract, user, {
      autoPrint,
      fallbackSignatureUrl: draftSig,
      fallbackSignerName: signerName,
      renewals: onlineRenewals,
    })
  }

  const handleOpenContractRowInNewTab = async (c) => {
    let rens = []
    try {
      const list = await api.payments.forContract(c.id)
      rens = sortRenewalsAscending((list || []).filter((p) => p.paymentType === 'RENEWAL'))
    } catch {
      rens = []
    }
    openContractInNewPage(c, user, { autoPrint: false, renewals: rens })
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
          await api.payments.simulateGateway(pendingRenewal.id, {
            paymentMethod: method,
            transactionReference: transferRef || undefined,
          })
        }
      }
      toast(
        payNow
          ? `Đã thanh toán gia hạn và lập Phụ lục gia hạn hợp đồng ${maskContractCode(renewTarget)} thêm ${months} tháng thành công!`
          : `Đã lập Phụ lục gia hạn (Chờ thanh toán) cho hợp đồng ${maskContractCode(renewTarget)}.`
      )

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
      await api.payments.simulateGateway(payment.id, {
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: `VIETQR-INV-${payment.id}`,
      })
      toast('Đã thanh toán hóa đơn thành công!')
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
        const signed = !!c.signedAt
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
            {c.status === 'COMPLETED' ? 'Đã hoàn trả sau khi trả kho' : 'Hoàn trả khi kết thúc hợp đồng'}
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
            <PenTool size={14} /> {c.signedAt ? 'Xem HĐ & Phụ lục' : 'Ký HĐ Online'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleOpenContractRowInNewTab(c)}
          >
            <ExternalLink size={14} /> Mở trang HĐ
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
              <CalendarPlus size={14} /> Gia hạn (Phụ lục)
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

  const isSigned = !!onlineContract?.signedAt

  // Tính số tháng thuê của hợp đồng đang mở
  let contractMonths = 1
  if (onlineContract?.startDate && onlineContract?.endDate) {
    const s = new Date(onlineContract.startDate)
    const e = new Date(onlineContract.endDate)
    contractMonths = Math.max(1, Math.round(Math.max(1, (e - s) / (1000 * 60 * 60 * 24)) / 30))
  }

  // Nếu đang mở chế độ Trang Hợp Đồng Điện Tử khổ A4 lớn
  if (onlineContract) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            padding: '14px 20px',
            background: '#0f172a',
            color: '#fff',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button size="sm" variant="secondary" onClick={() => setOnlineContract(null)}>
              <ArrowLeft size={15} /> Quay lại danh sách
            </Button>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Hợp Đồng Thuê Kho Điện Tử · {officialContractNumber(onlineContract)}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                Trạng thái chữ ký: {isSigned ? `Đã ký điện tử bởi ${onlineContract.signerName || onlineContract.customerName}` : 'Chờ khách hàng ký xác nhận'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => handleOpenOrPrintContract(false)}>
              <ExternalLink size={15} /> Mở sang trang mới (Tab riêng)
            </Button>
            <Button size="sm" onClick={() => handleOpenOrPrintContract(true)}>
              <Printer size={15} /> Xuất PDF / In Hợp đồng (Có chữ ký)
            </Button>
          </div>
        </div>

        {/* Tờ Hợp đồng chuẩn khổ giấy A4 */}
        <div
          style={{
            background: '#ffffff',
            color: '#0f172a',
            padding: '44px 52px',
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            boxShadow: '0 12px 36px rgba(15, 23, 42, 0.10)',
            fontFamily: '"Times New Roman", Times, Georgia, serif',
            fontSize: 17,
            lineHeight: 1.72,
          }}
        >
          <div style={{ border: '3px double #1e293b', padding: '32px 36px' }}>
            {/* Quốc hiệu & Tiêu ngữ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '44% 56%',
                borderBottom: '1.5px solid #1e293b',
                paddingBottom: 16,
                marginBottom: 22,
              }}
            >
              <div style={{ textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  CÔNG TY TNHH HỆ THỐNG KHO VẬN<br />SAFESPACE VIỆT NAM
                </div>
                <div style={{ marginTop: 4 }}>
                  Số: <strong>{officialContractNumber(onlineContract)}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 16, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    display: 'inline-block',
                    borderBottom: '1.5px solid #0f172a',
                    paddingBottom: 3,
                  }}
                >
                  Độc lập – Tự do – Hạnh phúc
                </div>
                <div style={{ marginTop: 6, fontStyle: 'italic', fontSize: 15 }}>
                  TP. Hồ Chí Minh, ngày lập: {fmtDate(onlineContract.createdAt || onlineContract.startDate)}
                </div>
              </div>
            </div>

            {/* Tiêu đề Hợp đồng */}
            <div style={{ textAlign: 'center', margin: '22px 0 24px' }}>
              <h2
                style={{
                  fontFamily: '"Times New Roman", Times, Georgia, serif',
                  fontSize: 26,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#0f172a',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                HỢP ĐỒNG CHO THUÊ KHO LƯU TRỮ HÀNG HÓA
              </h2>
              <div style={{ fontStyle: 'italic', fontSize: 16, color: '#334155' }}>
                (Mã hợp đồng điện tử: <strong>{maskContractCode(onlineContract)}</strong> · Mã đơn đặt chỗ:{' '}
                <strong>#{onlineContract.reservationId || onlineContract.id}</strong>)
              </div>
            </div>

            {/* Căn cứ pháp lý */}
            <div style={{ fontStyle: 'italic', marginBottom: 18, textAlign: 'justify', fontSize: 16.5 }}>
              <div>– Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015 của Quốc hội nước Cộng hòa Xã hội Chủ nghĩa Việt Nam;</div>
              <div>– Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005 và Luật Giao dịch điện tử số 20/2023/QH15;</div>
              <div>– Căn cứ nhu cầu thuê kho lưu trữ của Khách hàng và năng lực cung ứng hạ tầng kho bãi của Công ty SafeSpace.</div>
              <div style={{ marginTop: 6 }}>
                Hôm nay, ngày <strong>{fmtDate(onlineContract.createdAt || onlineContract.startDate)}</strong>, chúng tôi gồm các bên dưới đây thống nhất giao kết Hợp đồng cho thuê kho lưu trữ với các điều khoản chi tiết như sau:
              </div>
            </div>

            {/* Thông tin Bên A */}
            <div style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase', borderBottom: '1px dashed #cbd5e1', paddingBottom: 4, marginBottom: 8 }}>
                I. BÊN CHO THUÊ KHO (GỌI TẮT LÀ BÊN A)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 16.5 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  Tên pháp nhân: <strong>CÔNG TY TNHH HỆ THỐNG KHO VẬN SAFESPACE VIỆT NAM</strong>
                </div>
                <div>Mã số doanh nghiệp: <strong>0318689999</strong></div>
                <div>Cơ sở quản lý kho: <strong>{onlineContract.facilityName || 'Hệ thống kho SafeSpace'}</strong></div>
                <div>Đại diện pháp lý: <strong>Ban Giám Đốc Vận Hành SafeSpace</strong></div>
                <div>Chức vụ: <strong>Giám đốc Khối Vận hành Kho vận</strong></div>
                <div style={{ gridColumn: 'span 2' }}>
                  Tài khoản thụ hưởng: <strong>0901000001 – Ngân hàng TMCP Quân Đội (MB Bank) – Chủ TK: SAFESPACE STORAGE</strong>
                </div>
              </div>
            </div>

            {/* Thông tin Bên B */}
            <div style={{ marginBottom: 20, padding: '14px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase', borderBottom: '1px dashed #cbd5e1', paddingBottom: 4, marginBottom: 8 }}>
                II. BÊN THUÊ KHO (GỌI TẮT LÀ BÊN B – KHÁCH HÀNG)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 16.5 }}>
                <div>Họ và tên người thuê: <strong>{onlineContract.customerName || user?.fullname || 'Khách hàng'}</strong></div>
                <div>Mã khách hàng định danh: <strong>KH-{onlineContract.customerId || user?.id || '01'}</strong></div>
                <div>Email đăng ký tài khoản: <strong>{user?.email || 'Đã xác thực trên hệ thống SafeSpace'}</strong></div>
                <div>Người đại diện ký kết: <strong>{onlineContract.signerName || signerName || onlineContract.customerName}</strong></div>
              </div>
            </div>

            {/* Điều 1 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 17.5, textTransform: 'uppercase', marginBottom: 6 }}>
                ĐIỀU 1: ĐỐI TƯỢNG HỢP ĐỒNG & QUY CÁCH Ô KHO BÀN GIAO
              </div>
              <div style={{ textAlign: 'justify', marginBottom: 8 }}>
                1.1. Bên A đồng ý cho Bên B thuê và Bên B đồng ý thuê không gian ô kho lưu trữ độc lập tại cơ sở của Bên A với thông số kỹ thuật và thời hạn cụ thể như sau:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 16 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Mã Hợp Đồng</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Cơ Sở Kho</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Loại Kho</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Ô Kho Bàn Giao</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Thời Hạn Thuê</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Trạng Thái</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>{maskContractCode(onlineContract)}</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>{onlineContract.facilityName}</td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>{onlineContract.unitTypeName || 'Tiêu chuẩn'}</td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>Ô kho {onlineContract.unitCode}</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                      <strong>{fmtDate(onlineContract.startDate)}</strong> – <strong>{fmtDate(onlineContract.endDate)}</strong>
                    </td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                      <strong>{STATUS_VI[onlineContract.status] || onlineContract.status}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ textAlign: 'justify' }}>
                1.2. Mục đích thuê: Lưu trữ tài sản, hàng hóa, vật dụng hợp pháp theo quy định của pháp luật Việt Nam và nội quy an toàn phòng cháy chữa cháy của hệ thống kho SafeSpace.
              </div>
            </div>

            {/* Điều 2 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 17.5, textTransform: 'uppercase', marginBottom: 6 }}>
                ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG, TIỀN ĐẶT CỌC & LỘ TRÌNH THANH TOÁN 2 ĐỢT
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 16 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Hạng Mục Thanh Toán</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Đơn Giá / Cách Tính</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Số Tiền (VNĐ)</th>
                    <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Điều Kiện Thực Hiện</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>Đợt 1: Tiền đặt cọc giữ kho</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>Đặt cọc bảo đảm hợp đồng</td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>{money(onlineContract.depositAmount)}</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>Thanh toán trong vòng 24 giờ từ lúc đặt kho; hoàn trả khi kết thúc hợp đồng.</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>Đợt 2: Tiền thuê kho ({contractMonths} tháng)</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>{money(onlineContract.monthlyPrice)} / tháng × {contractMonths} tháng</td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>{money(Number(onlineContract.monthlyPrice || 0) * contractMonths)}</strong></td>
                    <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>Thanh toán đủ 100% trước hoặc tại thời điểm Check-in nhận bàn giao chìa khóa.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Điều 3 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 17.5, textTransform: 'uppercase', marginBottom: 6 }}>
                ĐIỀU 3: CHÍNH SÁCH GIỮ CHỖ, KHẤU TRỪ VÀ HOÀN TRẢ TIỀN ĐẶT CỌC
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 22, textAlign: 'justify' }}>
                <li><strong>Hủy đặt chỗ trước hạn nhận kho trên 10 ngày:</strong> Bên A hoàn trả ngay lập tức <strong>100% tiền đặt cọc</strong> cho Bên B.</li>
                <li><strong>Hủy đặt chỗ hoặc nhận bàn giao kho trong vòng 10 ngày cuối trước hạn chót (01 tháng):</strong> Khấu trừ 20% phí giữ kho; số tiền cọc còn lại được ghi nhận hoàn trả cuối kỳ là <strong>{money(onlineContract.depositAmount)}</strong>.</li>
                <li><strong>Quá hạn 01 tháng không đến nhận kho:</strong> Đơn đặt chỗ tự động hủy và Bên B mất 100% tiền đặt cọc Đợt 1.</li>
                <li><strong>Hoàn trả tiền cọc khi kết thúc hợp đồng:</strong> Khi hết hạn thuê kho và Bên B bàn giao lại kho nguyên trạng (qua biên bản kiểm tra trả kho <em>Unit Return</em> không hư hại), Bên A hoàn trả toàn bộ số tiền cọc <strong>{money(onlineContract.depositAmount)}</strong> cho Bên B. Nếu có hư hại, phí đền bù sẽ được khấu trừ trực tiếp vào tiền cọc.</li>
              </ul>
            </div>

            {/* Điều 4 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 17.5, textTransform: 'uppercase', marginBottom: 6 }}>
                ĐIỀU 4: GIA HẠN HỢP ĐỒNG (LẬP PHỤ LỤC HỢP ĐỒNG CŨ), QUÁ HẠN & CAM KẾT PHÁP LÝ
              </div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 22, textAlign: 'justify' }}>
                <li><strong>Gia hạn bằng Phụ lục hợp đồng điện tử:</strong> Khi có nhu cầu thuê tiếp, Bên B thực hiện gia hạn từ <strong>01 đến 12 tháng</strong> mỗi lần ngay trên hợp đồng hiện tại (lập <em>Phụ lục gia hạn hợp đồng</em> mà không cần làm hợp đồng mới hay đóng lại tiền cọc). Ngày kết thúc hợp đồng được cộng nối tiếp ngay khi thanh toán phí gia hạn.</li>
                <li><strong>Cam kết an toàn lưu trữ:</strong> Bên B cam kết tuyệt đối không lưu trữ hàng quốc cấm, vũ khí, hóa chất độc hại, chất gây cháy nổ hoặc hàng hóa vi phạm pháp luật. Bên A đảm bảo hệ thống an ninh, camera giám sát 24/7 và phòng cháy chữa cháy tiêu chuẩn.</li>
                <li><strong>Hiệu lực hợp đồng điện tử:</strong> Hợp đồng được ký bằng chữ ký điện tử của Bên B và chữ ký số của Bên A có đầy đủ giá trị pháp lý để kích hoạt bàn giao ô kho.</li>
              </ul>
            </div>

            {/* Phụ lục gia hạn hợp đồng điện tử (nếu có) */}
            {onlineRenewals.length > 0 && (
              <div style={{ marginBottom: 20, padding: '14px 18px', background: '#f0fdf4', border: '1.5px solid #16a34a', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase', color: '#14532d', marginBottom: 8 }}>
                  PHỤ LỤC GIA HẠN HỢP ĐỒNG THUÊ KHO ĐIỆN TỬ (CONTRACT ADDENDUM)
                </div>
                <div style={{ fontSize: 15.5, marginBottom: 8, textAlign: 'justify' }}>
                  Các Phụ lục gia hạn dưới đây là một bộ phận không tách rời của Hợp đồng số <strong>{officialContractNumber(onlineContract)}</strong>, giữ nguyên ô kho <strong>{onlineContract.unitCode}</strong> và tiền đặt cọc <strong>{money(onlineContract.depositAmount)}</strong>:
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15.5, background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#dcfce7' }}>
                      <th style={{ border: '1px solid #334155', padding: '7px 10px', textAlign: 'left' }}>Mã Phụ Lục</th>
                      <th style={{ border: '1px solid #334155', padding: '7px 10px', textAlign: 'left' }}>Thời Gian Gia Hạn</th>
                      <th style={{ border: '1px solid #334155', padding: '7px 10px', textAlign: 'left' }}>Phí Gia Hạn</th>
                      <th style={{ border: '1px solid #334155', padding: '7px 10px', textAlign: 'left' }}>Ngày Lập / Thanh Toán</th>
                      <th style={{ border: '1px solid #334155', padding: '7px 10px', textAlign: 'left' }}>Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlineRenewals.map((r, idx) => {
                      const m = parseRenewalMonths(r, onlineContract.monthlyPrice)
                      const plNum = String(idx + 1).padStart(2, '0')
                      return (
                        <tr key={r.id || idx}>
                          <td style={{ border: '1px solid #334155', padding: '7px 10px' }}>
                            <strong>PL-{plNum}/{maskContractCode(onlineContract)}</strong>
                          </td>
                          <td style={{ border: '1px solid #334155', padding: '7px 10px' }}>
                            Gia hạn thêm <strong>{m} tháng</strong>
                          </td>
                          <td style={{ border: '1px solid #334155', padding: '7px 10px' }}>
                            <strong>{money(r.amount)}</strong>
                          </td>
                          <td style={{ border: '1px solid #334155', padding: '7px 10px' }}>
                            {fmtDateTime(r.paidAt || r.createdAt)}
                          </td>
                          <td style={{ border: '1px solid #334155', padding: '7px 10px' }}>
                            <strong>
                              {r.status === 'PAID' ? 'Đã thanh toán & Cộng hạn' : 'Chờ thanh toán'}
                            </strong>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Khu vực chữ ký 2 bên (To, trang trọng, hỗ trợ xuất PDF đầy đủ chữ ký) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 24,
                marginTop: 28,
                paddingTop: 22,
                borderTop: '2px solid #334155',
              }}
            >
              {/* Chữ ký Bên A (Vector SVG sắc nét khi in PDF) */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '18px 16px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fcfcfd',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase' }}>
                    ĐẠI DIỆN BÊN A (BÊN CHO THUÊ)
                  </div>
                  <div style={{ fontSize: 14, fontStyle: 'italic', color: '#475569' }}>
                    (Ký số & Đóng dấu pháp nhân SafeSpace)
                  </div>
                </div>

                <div style={{ margin: '16px auto' }}>
                  <svg width="210" height="125" viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="8" width="208" height="114" rx="10" fill="#fff5f5" stroke="#dc2626" strokeWidth="3" strokeDasharray="6,3" />
                    <rect x="12" y="14" width="196" height="102" rx="7" fill="none" stroke="#dc2626" strokeWidth="1.5" />
                    <text x="110" y="38" textAnchor="middle" fill="#dc2626" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="bold">
                      ĐÃ KÝ SỐ &amp; ĐÓNG DẤU BỞI
                    </text>
                    <text x="110" y="60" textAnchor="middle" fill="#b91c1c" fontFamily="Arial, sans-serif" fontSize="13.5" fontWeight="bold">
                      CÔNG TY TNHH HỆ THỐNG
                    </text>
                    <text x="110" y="79" textAnchor="middle" fill="#b91c1c" fontFamily="Arial, sans-serif" fontSize="13.5" fontWeight="bold">
                      KHO VẬN SAFESPACE
                    </text>
                    <text x="110" y="102" textAnchor="middle" fill="#15803d" fontFamily="Arial, sans-serif" fontSize="10.5" fontWeight="bold">
                      ✓ Xác thực hợp lệ · MST: 0318689999
                    </text>
                  </svg>
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>Ban Giám Đốc Vận Hành SafeSpace</div>
                  <div style={{ fontSize: 14, color: '#15803d', fontWeight: 600 }}>
                    Đã ký số tự động khi phát hành hợp đồng
                  </div>
                </div>
              </div>

              {/* Chữ ký Bên B (Khách hàng ký trực tiếp) */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '18px 16px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  background: '#fcfcfd',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase' }}>
                    ĐẠI DIỆN BÊN B (KHÁCH HÀNG THUÊ KHO)
                  </div>
                  <div style={{ fontSize: 14, fontStyle: 'italic', color: '#475569' }}>
                    (Ký điện tử xác nhận hợp đồng)
                  </div>
                </div>

                {isSigned ? (
                  <div style={{ margin: '16px auto' }}>
                    {onlineContract.signatureUrl && (
                      <img
                        src={assetUrl(onlineContract.signatureUrl)}
                        alt="Chữ ký khách hàng"
                        style={{
                          height: 120,
                          maxWidth: '100%',
                          objectFit: 'contain',
                          margin: '0 auto',
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: 6,
                        }}
                      />
                    )}
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18, marginTop: 10 }}>
                      {onlineContract.signerName || onlineContract.customerName}
                    </div>
                    <div style={{ fontSize: 14, color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                      <CheckCircle2 size={15} style={{ verticalAlign: -2 }} /> Đã ký điện tử lúc: {fmtDateTime(onlineContract.signedAt)}
                    </div>
                  </div>
                ) : onlineContract.status === 'PENDING' ? (
                  <div style={{ marginTop: 12, fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
                      Dùng chuột hoặc màn hình cảm ứng ký tên vào khung bên dưới:
                    </div>
                    <canvas
                      ref={canvasRef}
                      width={420}
                      height={160}
                      onMouseDown={startDraw}
                      onMouseMove={moveDraw}
                      onMouseUp={endDraw}
                      onMouseLeave={endDraw}
                      onTouchStart={startDraw}
                      onTouchMove={moveDraw}
                      onTouchEnd={endDraw}
                      style={{
                        width: '100%',
                        height: 155,
                        background: '#ffffff',
                        border: '2px dashed #64748b',
                        borderRadius: 8,
                        cursor: 'crosshair',
                        touchAction: 'none',
                      }}
                    />
                    <div style={{ marginTop: 10, textAlign: 'left' }}>
                      <Input
                        label="Họ và tên người đại diện ký (Bên B)"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
                      <Button size="sm" variant="secondary" onClick={clearCanvas} disabled={signing}>
                        <Eraser size={15} /> Xóa ký lại
                      </Button>
                      <Button size="sm" onClick={confirmDigitalSignature} loading={signing}>
                        <PenTool size={15} /> Xác nhận ký Hợp đồng điện tử
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ margin: '28px 0' }} className="small muted">
                    Hợp đồng chỉ có thể ký điện tử khi ở trạng thái Chờ kích hoạt (PENDING).
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Hợp Đồng Thuê Kho Điện Tử"
        subtitle="Xem, ký tên điện tử trực tiếp trên Hợp đồng thuê kho chuẩn khổ A4, xuất PDF có chữ ký, thanh toán Đợt 2 và lập Phụ lục gia hạn hợp đồng."
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

      {/* Modal Hóa đơn & Thanh toán Đợt 2 của Hợp đồng */}
      <Modal
        wide
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

      {/* Modal Gia hạn hợp đồng (Lập Phụ lục gia hạn hợp đồng cũ) */}
      <Modal
        wide
        open={!!renewTarget}
        title={renewTarget ? `Lập Phụ Lục Gia Hạn Hợp Đồng ${maskContractCode(renewTarget)} (Ô ${renewTarget.unitCode})` : 'Gia hạn Hợp đồng'}
        onClose={() => setRenewTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewTarget(null)} disabled={busy}>
              Hủy
            </Button>
            <Button loading={busy} onClick={submitRenewal}>
              {payNow ? `Thanh toán & Gia hạn ngay (${money(renewEstimate)})` : 'Tạo hóa đơn gia hạn'}
            </Button>
          </>
        }
      >
        {renewTarget && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Hình thức: <strong>Lập Phụ lục gia hạn trên Hợp đồng hiện tại ({maskContractCode(renewTarget)})</strong> — giữ nguyên ô kho{' '}
                <strong>{renewTarget.unitCode}</strong> và tiền cọc <strong>{money(renewTarget.depositAmount)}</strong>.<br />
                Ngày kết thúc hiện tại: <strong>{fmtDate(renewTarget.endDate)}</strong> · Giá thuê hàng tháng:{' '}
                <strong>{money(renewTarget.monthlyPrice)}</strong>
              </p>
            </div>
            <Select label="Số tháng muốn gia hạn thêm (1 – 12 tháng)" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
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
                <option value="YES">Thanh toán online ngay ({money(renewEstimate)}) — Tự động cộng thêm tháng & ban hành Phụ lục</option>
                <option value="NO">Chỉ tạo hóa đơn chờ thanh toán</option>
              </Select>
            </div>
            {payNow && (
              <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 20, borderRadius: 14, border: '2px solid #cbd5e1' }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center', background: '#fff', padding: 12, borderRadius: 12, border: '2px solid #f9b800', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
                    <img
                      src={vietQrUrl}
                      alt="VietQR Renewal"
                      style={{ width: 280, height: 280, objectFit: 'contain', margin: '0 auto' }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 6 }}>
                      QUÉT MÃ VIETQR ĐỂ GIA HẠN
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
                      <Building2 size={18} /> Thông tin chuyển khoản gia hạn
                    </div>
                    <div style={{ fontSize: 15, marginBottom: 4 }}>Ngân hàng: <strong>MB Bank (Quân Đội)</strong></div>
                    <div style={{ fontSize: 15, marginBottom: 4 }}>Số tài khoản: <strong>0901000001</strong></div>
                    <div style={{ fontSize: 15, marginBottom: 4 }}>Chủ tài khoản: <strong>SAFESPACE STORAGE</strong></div>
                    <div style={{ fontSize: 16, marginBottom: 4, color: '#b91c1c' }}>Số tiền gia hạn: <strong>{money(renewEstimate)}</strong></div>
                    <div style={{ fontSize: 15, marginBottom: 12 }}>Nội dung CK: <strong>{qrMemo}</strong></div>
                    <Input
                      label="Mã giao dịch chuyển khoản (tùy chọn)"
                      placeholder="VD: FT26305998877"
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

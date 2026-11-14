import { useEffect, useRef, useState } from 'react'
import { useCancellationPolicy } from '../../components/CancellationPolicy.jsx'
import { unitTypeLabel } from '../../utils/format.js'
import { Link, useSearchParams } from 'react-router-dom'
import { ContractProfileModal } from './ContractProfile.jsx'
import InvoiceModal from '../../components/InvoiceModal.jsx'
import { CalendarPlus, CreditCard, QrCode, Building2, PenTool, Printer, Eraser, CheckCircle2, ArrowLeft, ExternalLink } from 'lucide-react'
import GroupedList, { TileRow } from '../../components/GroupedList.jsx'
import { EarlyTerminationModal } from '../../components/EarlyTermination.jsx'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, CONTRACT_STATUSES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import BankQrPay from '../../components/BankQrPay.jsx'
import { CONTRACT_STATUS_VI, contractStatusText, maskContractCode, officialContractNumber, openContract, openContractInNewPage, openBlankContract, parseRenewalMonths, sortRenewalsAscending } from '../../utils/contractDocument.js'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const [profileFor, setProfileFor] = useState(null) // mã đơn đang điền hồ sơ trong cửa sổ nổi
  const [invoiceViewId, setInvoiceViewId] = useState(null)
  const [building, setBuilding] = useState(false) // đang lập hợp đồng từ hồ sơ vừa điền

  // Modal Gia hạn hợp đồng
  const [renewTarget, setRenewTarget] = useState(null)
  const [terminateTarget, setTerminateTarget] = useState(null) // hợp đồng đang mở cửa sổ yêu cầu hủy sớm
  const [months, setMonths] = useState(1)
  const policy = useCancellationPolicy()
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [payNow, setPayNow] = useState(true)
  const [renewQuote, setRenewQuote] = useState(null) // báo giá gia hạn của hợp đồng đang mở
  const [priceNotice, setPriceNotice] = useState(null) // báo giá khi giá gia hạn đã đổi, chờ khách xác nhận
  const [renewPay, setRenewPay] = useState(null) // hóa đơn gia hạn đang chờ khách quét QR
  const [qrInvoice, setQrInvoice] = useState(null) // hóa đơn trong modal Hóa đơn đang hiện QR
  const [transferRef, setTransferRef] = useState('')
  const [busy, setBusy] = useState(false)

  // Modal Lịch sử hóa đơn của hợp đồng
  const [invoiceTarget, setInvoiceTarget] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  // Trang xem & ký Hợp đồng Online chuẩn khổ A4 (đồng bộ trực tiếp từ Backend)
  const [onlineContract, setOnlineContract] = useState(null)
  // Hợp đồng đang xem được ghi trên địa chỉ trang (?contract=ID): nút Quay lại của trình duyệt về đúng danh sách hợp đồng.
  const openView = (c) => { setOnlineContract(c); setSearchParams({ contract: String(c.id) }) }
  const closeView = () => { setOnlineContract(null); setSearchParams({}, { replace: true }) }
  const wantedId = searchParams.get('contract')
  useEffect(() => {
    if (!wantedId && onlineContract) setOnlineContract(null)
    else if (wantedId && !onlineContract && data) {
      const found = data.find((x) => String(x.id) === wantedId)
      if (found) setOnlineContract(found)
    }
  }, [wantedId, data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [onlineRenewals, setOnlineRenewals] = useState([])
  const [signerName, setSignerName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  // Hồ sơ thông tin của hợp đồng đang mở (undefined = đang tải): quyết định có cho ký online hay không.
  const [signProfile, setSignProfile] = useState(undefined)
  useEffect(() => {
    setSignProfile(undefined)
    if (!onlineContract?.reservationId) return
    api.contractProfiles.get(onlineContract.reservationId).then((p) => setSignProfile(p || null)).catch(() => setSignProfile(null))
  }, [onlineContract?.id, onlineContract?.reservationId, onlineContract?.signedAt])

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
    openContract(onlineContract, user, {
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
    openContract(c, user, { autoPrint: false, renewals: rens })
  }

  const allRows = data || []
  const rows = statusFilter ? allRows.filter((c) => c.status === statusFilter) : allRows

  // Lấy báo giá mỗi khi mở hộp gia hạn hoặc đổi số tháng.
  useEffect(() => {
    if (!renewTarget) { setRenewQuote(null); return undefined }
    let alive = true
    api.rentalContracts.renewalQuote(renewTarget.id, Number(months))
      .then((q) => { if (alive) setRenewQuote(q) }).catch(() => { if (alive) setRenewQuote(null) })
    return () => { alive = false }
  }, [renewTarget, months])

  const submitRenewal = async (confirmed = false) => {
    if (!renewTarget) return
    setBusy(true)
    try {
      if (!confirmed) {
        const q = await api.rentalContracts.renewalQuote(renewTarget.id, Number(months))
        if (q.priceChanged) { setPriceNotice(q); setBusy(false); return }
      }
      await api.rentalContracts.renew(renewTarget.id, {
        months: Number(months),
        paymentMethod: method,
        paid: false,
        confirmPriceChange: confirmed,
      })

      const contractPayments = await api.payments.forContract(renewTarget.id)
      const pendingRenewal = (contractPayments || []).find(
        (p) => p.paymentType === 'RENEWAL' && p.status === 'PENDING'
      )
      if (pendingRenewal) {
        // Hiện mã QR để khách chuyển khoản; tiền vào là gia hạn tự động có hiệu lực.
        setRenewPay(pendingRenewal)
        toast(`Đã lập hóa đơn gia hạn ${months} tháng. Quý khách quét mã QR để thanh toán hoặc thanh toán sau trong mục Hóa đơn.`)
      } else {
        setRenewTarget(null)
      }
      reload()
    } catch (e) {
      if (String(e.message || '').startsWith('PRICE_CHANGED')) {
        try { setPriceNotice(await api.rentalContracts.renewalQuote(renewTarget.id, Number(months))) } catch { toast('Giá gia hạn đã thay đổi, vui lòng thử lại.', 'error') }
      } else {
        toast(e.message, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const payContractInvoice = async (payment) => {
    setBusy(true)
    try {
      // [Demo] giả lập thanh toán nhanh; thanh toán thật qua mã QR (BankQrPay).
      await api.payments.simulateGateway(payment.id, {
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: `VIETQR-INV-${payment.id}`,
      })
      setQrInvoice(null)
      toast('[Demo] Đã giả lập thanh toán hóa đơn thành công!')
      const updated = await api.payments.forContract(invoiceTarget.id)
      setInvoices(updated || [])
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const withdrawTermination = async (c) => {
    if (!window.confirm('Bạn muốn rút lại yêu cầu hủy hợp đồng này?')) return
    try {
      await api.terminations.withdraw(c.terminationId)
      toast('Đã rút lại yêu cầu hủy hợp đồng.')
      reload()
    } catch (e) { toast(e.message, 'error') }
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
              <Badge tone={signed ? 'green' : c.status === 'PENDING' ? 'amber' : 'neutral'}>
                {signed ? (c.signedAtCounter ? 'Đã ký tại chỗ' : 'Đã ký Online') : c.signedScanStatus === 'PENDING_REVIEW' ? 'Chờ quản lý duyệt ảnh ký' : c.status === 'PENDING' ? 'Chờ ký Online' : 'Không cần ký'}
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
            {c.unitTypeName ? `${unitTypeLabel(c.unitTypeName)} · ` : ''}Ô kho {c.unitCode || 'Đang gán'}
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
          <Badge status={c.status}>{contractStatusText(c)}</Badge>
          {c.overdue && c.status !== 'OVERDUE' && (
            <div style={{ marginTop: 4 }}>
              <Badge status="OVERDUE">Quá hạn</Badge>
            </div>
          )}
          {c.status === 'ACTIVE' && ['REQUESTED', 'INSPECTED'].includes(c.terminationStatus) && (
            <div style={{ marginTop: 4 }}>
              <Badge tone="yellow">Chờ xác nhận hủy</Badge>
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
          {/* Đã ký, hoặc hợp đồng không còn ở bước chờ ký (đang thuê / đã trả kho): chỉ xem. Đơn đã hủy chưa ký: khóa nút ký. */}
          {c.signedAt || (c.status !== 'PENDING' && c.status !== 'CANCELLED') ? (
            <Button size="sm" onClick={() => openView(c)}>
              <PenTool size={14} /> Xem HĐ & Phụ lục
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={c.status === 'CANCELLED'}
              title={c.status === 'CANCELLED' ? 'Hợp đồng đã hủy, không thể ký' : undefined}
              onClick={() => openView(c)}
            >
              <PenTool size={14} /> Ký HĐ Online
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setInvoiceTarget(c)}
          >
            <CreditCard size={14} /> Hóa đơn & thanh toán
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
          {c.status === 'ACTIVE' && (c.terminationStatus === 'REQUESTED' || c.terminationStatus === 'INSPECTED') ? (
            c.terminationStatus === 'REQUESTED'
              ? <Button size="sm" variant="secondary" onClick={() => withdrawTermination(c)}>Rút yêu cầu hủy</Button>
              : null
          ) : c.status === 'ACTIVE' && (
            <Button size="sm" variant="danger-outline" onClick={() => setTerminateTarget(c)}>
              Yêu cầu hủy sớm
            </Button>
          )}
        </div>
      ),
    },
  ]

  const renewEstimate = renewTarget
    ? (renewQuote && renewQuote.contractId === renewTarget.id && renewQuote.months === Number(months)
      ? Number(renewQuote.totalAmount)
      : Number(renewTarget.monthlyPrice || 0) * Number(months))
    : 0

  const isSigned = !!onlineContract?.signedAt

  // Tính số tháng thuê của hợp đồng đang mở
  let contractMonths = 1
  if (onlineContract?.startDate && onlineContract?.endDate) {
    const s = new Date(onlineContract.startDate)
    const e = new Date(onlineContract.endDate)
    contractMonths = Math.max(1, Math.round(Math.max(1, (e - s) / (1000 * 60 * 60 * 24)) / 30))
  }

  // Sau khi khách gửi hồ sơ: báo chờ một chút, rồi lập hợp đồng từ thông tin đã điền và hiện hợp đồng đầy đủ để khách ký.
  const onProfileSubmitted = async () => {
    const rid = profileFor
    setProfileFor(null)
    setBuilding(true)
    setSignProfile(undefined)
    const wait = new Promise((r) => setTimeout(r, 1600))
    let p = null
    try { p = rid ? await api.contractProfiles.get(rid) : null } catch { p = null }
    await wait
    setSignProfile(p || null)
    setBuilding(false)
    reload()
  }
  const profileModals = (
    <>
      <ContractProfileModal reservationId={profileFor} onClose={() => setProfileFor(null)} onSubmitted={onProfileSubmitted} />
      {building && (
        <div role="status" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Chờ một giây lát…</div>
            <p className="muted" style={{ margin: '8px 0 0' }}>Hệ thống đang lập hợp đồng từ thông tin quý khách vừa điền. Quý khách sẽ xem được hợp đồng đầy đủ và ký ngay bên dưới.</p>
          </div>
        </div>
      )}
    </>
  )

  // Nếu đang mở chế độ Trang Hợp Đồng Điện Tử khổ A4 lớn
  if (onlineContract) {
    const previewHtml = openContractInNewPage(onlineContract, user, {
      returnHtml: true, hideToolbar: true, profile: signProfile || null, renewals: onlineRenewals,
    })
    return (
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
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
            <Button size="sm" variant="secondary" onClick={closeView}>
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

        {/* Hợp đồng (xem trước đúng như bản in) */}
        <iframe
          title="Hợp đồng thuê kho"
          srcDoc={previewHtml}
          style={{ width: '100%', height: '88vh', minHeight: 760, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff' }}
        />
        <Card style={{ marginTop: 16, textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8 }}>Chữ ký Bên B (khách hàng)</h3>
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
                ) : onlineContract.status === 'PENDING' && signProfile === undefined ? (
                  <div className="small muted" style={{ margin: '24px 0' }}>Đang kiểm tra hồ sơ...</div>
                ) : onlineContract.status === 'PENDING' && (!signProfile || signProfile.status === 'DRAFT' || signProfile.status === 'REJECTED') ? (
                  <div style={{ margin: '20px 0', fontFamily: 'system-ui, sans-serif', border: '1.5px solid #b45309', color: '#92400e', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                    <strong>
                      {signProfile?.status === 'REJECTED'
                        ? 'Hồ sơ của quý khách chưa được chấp nhận, cần chỉnh sửa trước khi ký lại.'
                        : 'Quý khách cần điền hồ sơ thông tin hợp đồng trước khi ký.'}
                    </strong>
                    <div style={{ marginTop: 10 }}>
                      <Button size="sm" onClick={() => setProfileFor(onlineContract.reservationId)}>
                        {signProfile?.status === 'REJECTED' ? 'Chỉnh sửa hồ sơ' : 'Điền hồ sơ hợp đồng'}
                      </Button>
                    </div>
                  </div>
                ) : onlineContract.status === 'PENDING' && signProfile?.signAtCounterRequired ? (
                  <div style={{ margin: '20px 0', fontFamily: 'system-ui, sans-serif', border: '1.5px solid #b91c1c', color: '#991b1b', borderRadius: 10, padding: 14, textAlign: 'left' }}>
                    <strong>Hợp đồng này cần ký trực tiếp tại quầy khi nhận kho.</strong>
                    <div style={{ marginTop: 6 }}>Hồ sơ của quý khách đã chưa đạt 3 lần. Nhân viên sẽ hỗ trợ kiểm tra giấy tờ và ký cùng quý khách.</div>
                  </div>
                ) : onlineContract.status === 'PENDING' ? (
                  <div style={{ marginTop: 12, fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ border: '1.5px solid #b91c1c', background: 'rgba(185,28,28,.08)', color: '#7f1d1d', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, textAlign: 'left' }}>
                      <strong>Lưu ý:</strong> đây là hợp đồng có giá trị pháp lý. Chữ ký chỉ được gửi <strong>một lần</strong>,
                      vui lòng ký đúng và rõ ràng, giống chữ ký trên giấy tờ tùy thân.
                    </div>
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
                    Hợp đồng chỉ có thể ký điện tử khi hợp đồng đang chờ nhận kho.
                  </div>
                )}
        </Card>
        {profileModals}
        <InvoiceModal paymentId={invoiceViewId} onClose={() => setInvoiceViewId(null)} />
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
        <GroupedList
          storageKey="contractsView"
          items={rows}
          typeOf={(c) => unitTypeLabel(c.unitTypeName) || 'Kho lưu trữ'}
          columns={columns}
          renderCard={(c) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div className="cell-title" style={{ fontSize: 16 }}>{maskContractCode(c)}</div>
                  <div className="cell-sub">Ô kho {c.unitCode || 'đang gán'} · {c.facilityName || 'Cơ sở kho'}</div>
                </div>
                <Badge status={c.status}>{contractStatusText(c)}</Badge>
              </div>
              <TileRow label="Thời hạn">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</TileRow>
              <TileRow label="Giá thuê / tháng">{money(c.monthlyPrice)}</TileRow>
              <TileRow label="Tiền cọc">{money(c.depositAmount)}</TileRow>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge tone={c.signedAt ? 'green' : c.status === 'PENDING' ? 'amber' : 'neutral'}>
                  {c.signedAt ? (c.signedAtCounter ? 'Đã ký tại chỗ' : 'Đã ký Online') : c.signedScanStatus === 'PENDING_REVIEW' ? 'Chờ quản lý duyệt ảnh ký' : c.status === 'PENDING' ? 'Chờ ký Online' : 'Không cần ký'}
                </Badge>
                {c.overdue && c.status !== 'OVERDUE' && <Badge status="OVERDUE">Quá hạn</Badge>}
                {c.status === 'ACTIVE' && ['REQUESTED', 'INSPECTED'].includes(c.terminationStatus) && <Badge tone="yellow">Chờ xác nhận hủy</Badge>}
              </div>
              <div style={{ marginTop: 'auto' }}>{columns.find((x) => x.key === 'actions').render(c)}</div>
            </>
          )}
          groupNote={(list) => <>Tiền cọc hoàn cuối kỳ: <strong style={{ color: 'var(--text)' }}>{money(list.reduce((t, c) => t + Number(c.depositAmount || 0), 0))}</strong></>}
          empty={
            <EmptyState
              title="Chưa có hợp đồng thuê kho nào"
              message="Hợp đồng thuê kho điện tử sẽ tự động được tạo ngay khi đơn đặt chỗ của bạn được gán ô kho."
            />
          }
        />
      )}

      {/* Sao kê thanh toán của hợp đồng: cọc Đợt 1, tiền thuê Đợt 2, gia hạn và mọi khoản phát sinh */}
      <Modal
        wide
        open={!!invoiceTarget}
        title={invoiceTarget ? `Sao kê thanh toán · Hợp đồng ${maskContractCode(invoiceTarget)} (Ô ${invoiceTarget.unitCode})` : 'Sao kê thanh toán'}
        onClose={() => { setInvoiceTarget(null); setQrInvoice(null) }}
        footer={<Button variant="secondary" onClick={() => { setInvoiceTarget(null); setQrInvoice(null) }}>Đóng</Button>}
      >
        {loadingInvoices ? (
          <LoadingState />
        ) : (() => {
          const rows = invoices || []
          const sum = (f) => rows.filter(f).reduce((s, x) => s + Number(x.amount || 0), 0)
          const paid = sum((x) => x.status === 'PAID' && x.paymentMethod !== 'TRU_VAO_COC')
          const pending = sum((x) => x.status === 'PENDING')
          const deducted = sum((x) => x.paymentMethod === 'TRU_VAO_COC')
          const deposit = rows.find((x) => x.paymentType === 'DEPOSIT')
          return (
            <div style={{ display: 'grid', gap: 14 }}>
              <p className="muted small" style={{ margin: 0 }}>
                Danh sách mọi khoản thu của hợp đồng này: tiền cọc (Đợt 1), tiền thuê (Đợt 2), gia hạn và các khoản phát sinh
                (phí quá hạn, phụ phí, phí hư hại). Khoản mới phát sinh sẽ tự xuất hiện tại đây.
              </p>
              <div className="grid grid-3" style={{ gap: 10 }}>
                <div className="loc-card" style={{ padding: 12 }}><div className="muted small">Đã thanh toán</div><strong style={{ fontSize: 19 }}>{money(paid)}</strong></div>
                <div className="loc-card" style={{ padding: 12 }}><div className="muted small">Còn phải thanh toán</div><strong style={{ fontSize: 19, color: pending > 0 ? '#b91c1c' : undefined }}>{money(pending)}</strong></div>
                <div className="loc-card" style={{ padding: 12 }}><div className="muted small">Tiền cọc đang giữ</div><strong style={{ fontSize: 19 }}>{money(deposit?.status === 'PAID' ? deposit.amount : 0)}</strong></div>
              </div>
              {deducted > 0 && <div className="small muted">Đã trừ trực tiếp vào tiền cọc: {money(deducted)}.</div>}
              {rows.length === 0 ? (
                <p className="muted">Chưa có khoản thu nào gắn với hợp đồng này.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px 6px' }}>Ngày</th><th style={{ padding: '8px 6px' }}>Khoản thu</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Số tiền</th><th style={{ padding: '8px 6px' }}>Trạng thái</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px dashed var(--border)' }}>
                          <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>{fmtDateTime(inv.paidAt || inv.createdAt)}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <strong>{PAY_TYPE_VI[inv.paymentType] || inv.paymentType}</strong>
                            {inv.paymentMethod === 'TRU_VAO_COC' && <div className="small muted">Đã trừ vào tiền cọc</div>}
                            {inv.refundAmount != null && <div className="small muted">Hoàn lại {money(inv.refundAmount)}{inv.refundedAt ? ' (đã chuyển khoản)' : ' (chờ chuyển khoản)'}</div>}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>{money(inv.amount)}</td>
                          <td style={{ padding: '10px 6px' }}><Badge status={inv.status}>{PAY_STATUS_VI[inv.status] || inv.status}</Badge></td>
                          <td style={{ padding: '10px 6px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <Button size="sm" variant="secondary" onClick={() => setInvoiceViewId(inv.id)}>Xem hóa đơn</Button>{' '}
                            {inv.status === 'PENDING' && <Button size="sm" onClick={() => setQrInvoice(inv)}><QrCode size={14} /> Thanh toán</Button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {qrInvoice && (
                <div style={{ marginTop: 6 }}>
                  <BankQrPay
                    payment={qrInvoice}
                    onPaid={async () => {
                      toast('Đã nhận được tiền. Cảm ơn quý khách!')
                      setQrInvoice(null)
                      const updated = await api.payments.forContract(invoiceTarget.id)
                      setInvoices(updated || [])
                      reload()
                    }}
                  />
                  <Button variant="secondary" size="sm" loading={busy} onClick={() => payContractInvoice(qrInvoice)} style={{ marginTop: 10 }}>
                    [Demo] Giả lập đã thanh toán
                  </Button>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      <InvoiceModal paymentId={invoiceViewId} onClose={() => setInvoiceViewId(null)} />
      {profileModals}

      {/* Hộp thoại chặn màn hình: giá gia hạn đã đổi, khách phải xác nhận mới được tiếp tục */}
      {priceNotice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div role="alertdialog" aria-modal="true" aria-label="Giá gia hạn đã thay đổi"
            style={{ background: '#fff', color: '#0f172a', borderRadius: 16, padding: 24, maxWidth: 520, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>
            <h3 style={{ margin: '0 0 8px' }}>Giá gia hạn đã thay đổi</h3>
            <p className="muted" style={{ marginTop: 0 }}>Giá gia hạn mỗi tháng hiện khác với giá quý khách đang trả. Vui lòng xác nhận trước khi tiếp tục.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
              <tbody>
                <tr><td style={{ padding: '8px 0' }}>Giá bạn đang trả</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(priceNotice.currentMonthlyRate)} / tháng</td></tr>
                <tr>
                  <td style={{ padding: '8px 0' }}>Giá gia hạn mới</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {money(priceNotice.newMonthlyRate)} / tháng{' '}
                    <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 999, fontSize: 12, color: '#fff', background: Number(priceNotice.changePercent) > 0 ? '#b91c1c' : '#15803d' }}>
                      {Number(priceNotice.changePercent) > 0 ? '+' : ''}{Number(priceNotice.changePercent)}%
                    </span>
                  </td>
                </tr>
                <tr style={{ borderTop: '1px solid #e2e8f0' }}><td style={{ padding: '8px 0' }}>Tổng phí gia hạn {priceNotice.months} tháng</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(priceNotice.totalAmount)}</td></tr>
              </tbody>
            </table>
            <p className="muted small">Hợp đồng hiện tại vẫn giữ nguyên giá đã ký. Giá mới chỉ áp dụng cho lần gia hạn này.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setPriceNotice(null)}>Không gia hạn</Button>
              <Button onClick={() => { setPriceNotice(null); submitRenewal(true) }}>Đồng ý giá mới và tiếp tục</Button>
            </div>
          </div>
        </div>
      )}

      <EarlyTerminationModal contract={terminateTarget} onClose={() => setTerminateTarget(null)} onDone={() => { setTerminateTarget(null); reload() }} />

      {/* Modal Gia hạn hợp đồng (Lập Phụ lục gia hạn hợp đồng cũ) */}
      <Modal
        wide
        open={!!renewTarget}
        title={renewTarget ? `Lập Phụ Lục Gia Hạn Hợp Đồng ${maskContractCode(renewTarget)} (Ô ${renewTarget.unitCode})` : 'Gia hạn Hợp đồng'}
        onClose={() => { if (!priceNotice) { setRenewTarget(null); setRenewPay(null) } }}
        footer={
          renewPay ? (
            <>
              <Button variant="secondary" onClick={() => { setRenewTarget(null); setRenewPay(null) }}>
                Thanh toán sau
              </Button>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await api.payments.simulateGateway(renewPay.id, { paymentMethod: 'BANK_TRANSFER' })
                    toast('[Demo] Đã giả lập thanh toán gia hạn.')
                    setRenewTarget(null)
                    setRenewPay(null)
                    reload()
                  } catch (e) {
                    toast(e.message, 'error')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                [Demo] Giả lập đã thanh toán
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setRenewTarget(null)} disabled={busy}>
                Hủy
              </Button>
              <Button loading={busy} onClick={() => submitRenewal(false)}>
                Tạo hóa đơn gia hạn ({money(renewEstimate)})
              </Button>
            </>
          )
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
            {renewPay ? (
              <div className="span-2">
                <BankQrPay
                  payment={renewPay}
                  onPaid={() => {
                    toast(`Đã nhận tiền gia hạn. Hợp đồng ${maskContractCode(renewTarget)} đã được kéo dài thêm ${months} tháng.`)
                    setRenewTarget(null)
                    setRenewPay(null)
                    reload()
                  }}
                />
              </div>
            ) : (
              <div className="span-2">
                <Select label={`Số tháng gia hạn (tối đa ${policy.maxRenewalMonths} tháng mỗi lần)`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {Array.from({ length: policy.maxRenewalMonths }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m} tháng</option>
                  ))}
                </Select>
                <p className="muted small" style={{ marginTop: 8 }}>
                  Thông tin ô kho, giá thuê và tiền cọc được giữ nguyên theo hợp đồng. Sau khi tạo hóa đơn, quý khách quét mã QR để
                  thanh toán ngay hoặc thanh toán sau trong mục Hóa đơn của hợp đồng. Khi tiền về, hợp đồng tự động kéo dài thêm
                  {` ${months}`} tháng.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

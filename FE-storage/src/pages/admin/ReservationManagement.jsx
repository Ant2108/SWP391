import { useEffect, useState } from 'react'
import { unitTypeLabel } from '../../utils/format.js'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Plus, X, CreditCard, RefreshCw, FileText, Printer, ArrowLeft, ExternalLink } from 'lucide-react'
import InvoiceModal from '../../components/InvoiceModal.jsx'
import CounterSign from '../../components/CounterSign.jsx'
import SignedScanCard from '../../components/SignedScanCard.jsx'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select, Textarea } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, RESERVATION_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import { contractStatusText, maskContractCode, officialContractNumber, openContract, openContractInNewPage, openBlankContract, parseRenewalMonths, sortRenewalsAscending } from '../../utils/contractDocument.js'

const RES_STATUS_VI = {
  PENDING: 'Chờ duyệt & gán kho',
  ASSIGNED: 'Đã gán ô kho',
  CONFIRMED: 'Đã gán ô kho',
  COMPLETED: 'Hoàn tất bàn giao',
  CANCELLED: 'Đã hủy',
}

const CONTRACT_STATUS_VI = {
  PENDING: 'Chờ nhận kho',
  ACTIVE: 'Đang thuê',
  OVERDUE: 'Quá hạn',
  COMPLETED: 'Đã thanh lý',
  CANCELLED: 'Đã hủy',
}

const PAY_STATUS_VI = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  REFUNDED: 'Đã hoàn tiền',
  FAILED: 'Đã hủy',
}

const PAY_TYPE_VI = {
  DEPOSIT: 'Tiền đặt cọc (Đợt 1)',
  RENTAL: 'Tiền thuê kho (Đợt 2)',
  RENEWAL: 'Phí gia hạn',
  OVERDUE_FEE: 'Phí phạt quá hạn',
  EXTRA_FEE: 'Phụ phí phát sinh',
  DAMAGE_FEE: 'Phí đền bù hư hại',
}

const METHOD_VI = {
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  VNPAY: 'VNPay QR',
  MOMO: 'Ví MoMo',
  CARD: 'Thẻ ngân hàng',
  CASH: 'Tiền mặt tại quầy',
}

export default function ReservationManagement() {
  const { user } = useAuth()
  const toast = useToast()

  const { pathname } = useLocation()

  // Phân quyền (khớp @PreAuthorize ở BE): chỉ Facility Manager được gán / đổi ô kho. Admin chỉ xem.
  // Facility Staff không có quyền phân kho nên ẩn nút Gán ô kho.
  const canAssignUnit = user?.role === 'FACILITY_MANAGER'
  // Business Manager chỉ XEM đơn, hợp đồng, thanh toán để theo dõi kinh doanh; việc thu tiền / kích hoạt do cơ sở làm.
  const readOnly = user?.role === 'BUSINESS_MANAGER'

  // Mỗi mục menu (/admin/rental-contracts, /admin/payments, /admin/overdue) mở đúng tab tương ứng.
  const tabFromPath = pathname.endsWith('/rental-contracts') ? 'CONTRACTS'
    : pathname.endsWith('/payments') ? 'PAYMENTS'
      : pathname.endsWith('/overdue') ? 'CONTRACTS'
        : readOnly ? 'CONTRACTS' : 'RESERVATIONS'
  const [tab, setTab] = useState(tabFromPath)
  useEffect(() => { setTab(tabFromPath) }, [tabFromPath])
  const [resStatusFilter, setResStatusFilter] = useState('')
  // Mục menu "quá hạn" mở tab Hợp đồng với bộ lọc Quá hạn.
  const [contractStatusFilter, setContractStatusFilter] = useState(pathname.endsWith('/overdue') ? 'OVERDUE' : '')
  useEffect(() => { if (pathname.endsWith('/overdue')) setContractStatusFilter('OVERDUE') }, [pathname])
  const [invoiceId, setInvoiceId] = useState(null)
  const [showCancelledPay, setShowCancelledPay] = useState(false)
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('')
  const [payTypeFilter, setPayTypeFilter] = useState('')

  // Modal Gán ô kho (Assign Unit)
  const [selectedRes, setSelectedRes] = useState(null)
  const [availableUnits, setAvailableUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [unitId, setUnitId] = useState('')
  const [busy, setBusy] = useState(false)

  // Modal Phát sinh phí (Extra Fee / Damage Fee)
  const [feeContract, setFeeContract] = useState(null)
  const [waiving, setWaiving] = useState(null) // khoản phí đang được miễn
  const [waiveReason, setWaiveReason] = useState('')
  const [feeType, setFeeType] = useState('EXTRA_FEE')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeNote, setFeeNote] = useState('')

  // Xem Hợp đồng Online chuẩn khổ A4 & Chữ ký điện tử (đọc trực tiếp từ Backend)
  const [onlineContract, setOnlineContract] = useState(null)
  const [onlineRenewals, setOnlineRenewals] = useState([])
  const [adminProfile, setAdminProfile] = useState(null)
  useEffect(() => {
    setAdminProfile(null)
    if (!onlineContract?.reservationId) return
    api.contractProfiles.get(onlineContract.reservationId).then((p) => setAdminProfile(p || null)).catch(() => setAdminProfile(null))
  }, [onlineContract?.id, onlineContract?.reservationId, onlineContract?.signedAt])

  // Bộ lọc cơ sở / loại kho (lọc tại trang) cho hai tab Đơn đặt chỗ và Hợp đồng.
  const [facFilter, setFacFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const scope = useAsync(async () => {
    const facs = await api.facilities.list()
    const per = await Promise.all(facs.map((f) => api.unitTypes.listByFacility(f.id).catch(() => [])))
    return { facs, types: [...new Set(per.flat().map((t) => t.typeName))].sort((a, b) => unitTypeLabel(a).localeCompare(unitTypeLabel(b), 'vi')) }
  }, [])
  const byScope = (r) => (!facFilter || String(r.facilityId) === facFilter) && (!typeFilter || r.unitTypeName === typeFilter)
  const scopeFilters = (
    <>
      <Select label="Lọc theo cơ sở" value={facFilter} onChange={(e) => setFacFilter(e.target.value)}>
        <option value="">Tất cả cơ sở</option>
        {scope.data?.facs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>
      <Select label="Lọc theo loại kho" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
        <option value="">Tất cả loại kho</option>
        {scope.data?.types.map((n) => <option key={n} value={n}>{unitTypeLabel(n)}</option>)}
      </Select>
    </>
  )
  const reservations = useAsync(() => api.reservations.list({ status: resStatusFilter || undefined }), [resStatusFilter])
  const contracts = useAsync(() => api.rentalContracts.list({ status: contractStatusFilter || undefined }), [contractStatusFilter])
  const allContracts = useAsync(() => api.rentalContracts.list())
  const payments = useAsync(
    () => api.payments.list({ status: payStatusFilter || undefined, paymentType: payTypeFilter || undefined }),
    [payStatusFilter, payTypeFilter]
  )

  const reloadAll = () => {
    reservations.reload()
    contracts.reload()
    allContracts.reload()
    payments.reload()
  }

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
    if (!selectedRes) {
      setAvailableUnits([])
      return
    }
    setLoadingUnits(true)
    api.storageUnits
      .search({
        facilityId: selectedRes.facilityId,
        unitTypeId: selectedRes.unitTypeId,
        status: 'AVAILABLE',
      })
      .then((list) => {
        setAvailableUnits(list || [])
        if (list?.length && !selectedRes.storageUnitId) {
          setUnitId(String(list[0].id))
        }
      })
      .catch(() => setAvailableUnits([]))
      .finally(() => setLoadingUnits(false))
  }, [selectedRes])

  const assignUnit = async () => {
    if (!unitId) return toast('Vui lòng chọn một ô kho còn trống để gán!', 'error')
    setBusy(true)
    try {
      await api.reservations.assignUnit(selectedRes.id, Number(unitId))
      toast(`Đã gán ô kho và xác nhận đơn đặt chỗ #${selectedRes.id}! Hợp đồng đã sẵn sàng để nhân viên cho khách nhận kho.`)
      setSelectedRes(null)
      setUnitId('')
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const cancelReservation = async (r) => {
    setBusy(true)
    try {
      await api.reservations.cancel(r.id)
      toast(`Đã hủy đơn đặt chỗ #${r.id}.`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const submitExtraFee = async () => {
    if (!feeContract) return
    setBusy(true)
    try {
      await api.payments.create({
        rentalContractId: feeContract.id,
        paymentType: feeType,
        amount: feeAmount ? Number(feeAmount) : undefined,
        transactionReference: feeNote || undefined,
        paid: false,
      })
      toast(`Đã phát hành hóa đơn ${PAY_TYPE_VI[feeType] || feeType} cho Hợp đồng #${feeContract.id}`)
      setFeeContract(null)
      setFeeAmount('')
      setFeeNote('')
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const markPaymentPaid = async (p) => {
    setBusy(true)
    try {
      await api.payments.markPaid(p.id, {
        paymentMethod: p.paymentMethod || 'CASH',
        transactionReference: p.transactionReference || `XAC-NHAN-QUAY-${p.id}`,
      })
      toast(`Đã xác nhận thu tiền hóa đơn #${p.id}!`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const waiveFee = async () => {
    if (!waiving) return
    if (!waiveReason.trim()) { toast('Vui lòng nhập lý do miễn phí', 'error'); return }
    setBusy(true)
    try {
      await api.payments.waive(waiving.id, waiveReason.trim())
      toast(`Đã miễn khoản phí #${waiving.id} cho khách`)
      setWaiving(null)
      setWaiveReason('')
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const markRefundDone = async (p) => {
    const ref = window.prompt(`Nhập mã giao dịch chuyển khoản hoàn ${money(p.refundAmount)} cho khách (có thể để trống):`, '')
    if (ref === null) return
    setBusy(true)
    try {
      await api.payments.refundTransferred(p.id, { reference: ref || undefined })
      toast('Đã ghi nhận chuyển khoản hoàn cọc và thông báo cho khách.')
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
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

  const visiblePayments = (payments.data || []).filter((p) => {
    if (!showCancelledPay && p.reservationStatus === 'CANCELLED') return false
    const d = (p.paidAt || p.createdAt || '').slice(0, 10)
    if (payFrom && d < payFrom) return false
    if (payTo && d > payTo) return false
    return true
  })

  const reservationColumns = [
    {
      key: 'id',
      header: 'Mã đơn',
      render: (r) => (
        <>
          <div className="cell-title">Đơn #{r.id}</div>
          <div className="cell-sub">{fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'customer',
      header: 'Khách hàng',
      render: (r) => r.customerName || `Khách hàng #${r.customerId}`,
    },
    {
      key: 'unit',
      header: 'Cơ sở & Ô kho',
      render: (r) => (
        <>
          <div className="cell-title">
            {unitTypeLabel(r.unitTypeName) || `Loại #${r.unitTypeId}`}
            {r.unitCode ? ` · Ô ${r.unitCode}` : ' · Chưa gán ô'}
          </div>
          <div className="cell-sub">{r.facilityName || `Cơ sở #${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Ngày nhận / Thời hạn',
      render: (r) => `${fmtDate(r.startDate)} · ${r.rentalMonths} tháng`,
    },
    {
      key: 'deposit',
      header: 'Tiền cọc (Đợt 1)',
      render: (r) => (
        <div>
          <div>{money(r.depositAmount)}</div>
          <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>
            {r.depositPaid ? 'Đã đóng cọc' : 'Chờ đóng cọc'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (r) => <Badge status={r.status}>{RES_STATUS_VI[r.status] || r.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (r) => {
        if (!canAssignUnit) return null
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && (
              <Button
                size="sm"
                disabled={!r.depositPaid}
                title={r.depositPaid ? '' : 'Khách chưa đóng cọc Đợt 1 nên chưa gán được ô kho'}
                onClick={() => {
                  setSelectedRes(r)
                  setUnitId(r.storageUnitId ? String(r.storageUnitId) : '')
                }}
              >
                {r.unitCode ? 'Đổi ô kho' : 'Gán ô kho'}
              </Button>
            )}
            {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && (
              <Button size="sm" variant="danger-outline" loading={busy} onClick={() => cancelReservation(r)}>
                <X size={14} /> Hủy đơn
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const contractColumns = [
    {
      key: 'id',
      header: 'Hợp đồng',
      render: (c) => {
        const signed = !!c.signedAt
        return (
          <>
            <div className="cell-title">HĐ #{c.id}</div>
            <div className="cell-sub">Đơn #{c.reservationId} · {signed ? 'Đã ký Online' : 'Chưa ký'}</div>
          </>
        )
      },
    },
    { key: 'customer', header: 'Khách hàng', render: (c) => c.customerName || `Khách hàng #${c.customerId}` },
    {
      key: 'unit',
      header: 'Ô kho & Cơ sở',
      render: (c) => (
        <>
          <div className="cell-title">Ô kho {c.unitCode || c.storageUnitId}</div>
          <div className="cell-sub">{c.facilityName || ''}</div>
        </>
      ),
    },
    { key: 'period', header: 'Thời hạn thuê', render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}` },
    {
      key: 'rent',
      header: 'Giá tháng / Tiền cọc',
      render: (c) => (
        <>
          <div>{money(c.monthlyPrice)} / tháng</div>
          <div className="cell-sub">Cọc: {money(c.depositAmount)}</div>
        </>
      ),
    },
    { key: 'status', header: 'Trạng thái', render: (c) => <Badge status={c.status}>{contractStatusText(c)}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => setOnlineContract(c)}>
            <FileText size={14} /> Xem HĐ & Phụ lục
          </Button>
          {canAssignUnit && ['ACTIVE', 'OVERDUE'].includes(c.status) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFeeContract(c)
                setFeeType('EXTRA_FEE')
                setFeeAmount('')
                setFeeNote('')
              }}
            >
              <Plus size={14} /> Tạo phí phụ thu
            </Button>
          )}
        </div>
      ),
    },
  ]

  const paymentColumns = [
    { key: 'id', header: 'Mã HĐ', render: (p) => <><div className="cell-title">#{p.id}</div><div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div></> },
    { key: 'customer', header: 'Khách hàng', render: (p) => p.customerName || `Khách hàng #${p.customerId}` },
    {
      key: 'ref',
      header: 'Nội dung thu',
      render: (p) => (
        <>
          <div className="cell-title">{(p.transactionReference || '').startsWith('TRE_DOT_2') ? 'Phí trễ hạn đóng tiền thuê Đợt 2' : (PAY_TYPE_VI[p.paymentType] || p.paymentType)}</div>
          <div className="cell-sub">
            {[p.rentalContractId && `Hợp đồng #${p.rentalContractId}`, p.reservationId && `Đơn #${p.reservationId}`, p.unitCode && `Ô ${p.unitCode}`, p.transactionReference && `Mã CK: ${p.transactionReference}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Số tiền',
      render: (p) => (
        <>
          <strong>{money(p.amount)}</strong>
          {p.refundAmount != null && (
            <div className="cell-sub" style={{ color: p.refundedAt ? '#15803d' : '#b45309', fontWeight: 600 }}>
              Hoàn {money(p.refundAmount)} · {p.refundedAt ? 'đã chuyển khoản' : `chờ chuyển khoản, ghi nội dung: HC${p.id}`}
            </div>
          )}
        </>
      ),
    },
    { key: 'method', header: 'Phương thức', render: (p) => (p.paymentMethod ? METHOD_VI[p.paymentMethod] || p.paymentMethod : '—') },
    { key: 'status', header: 'Trạng thái', render: (p) => <Badge status={p.status} tone={p.waivedAt ? 'neutral' : undefined}>{p.waivedAt ? 'Đã miễn' : (PAY_STATUS_VI[p.status] || p.status)}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setInvoiceId(p.id)}>
            <FileText size={14} /> Xem hóa đơn
          </Button>
          {/* Chuyển khoản online tự động PAID; nút này chỉ dùng khi khách đưa tiền mặt / chuyển vào tài khoản nhân viên tại quầy. */}
          {!readOnly && p.status === 'PENDING' && (
            <Button size="sm" loading={busy} onClick={() => markPaymentPaid(p)}>
              <CreditCard size={14} /> Đã thu tiền mặt
            </Button>
          )}
          {['FACILITY_MANAGER', 'BUSINESS_MANAGER'].includes(user?.role) && p.status === 'PENDING'
            && ['OVERDUE_FEE', 'EXTRA_FEE', 'DAMAGE_FEE'].includes(p.paymentType) && (
            <Button size="sm" variant="secondary" onClick={() => { setWaiving(p); setWaiveReason('') }}>
              Miễn phí
            </Button>
          )}
          {canAssignUnit && p.status === 'REFUNDED' && p.refundAmount > 0 && !p.refundedAt && (
            <Button size="sm" loading={busy} onClick={() => markRefundDone(p)}>
              <CheckCircle2 size={14} /> Đã chuyển hoàn cọc
            </Button>
          )}
        </div>
      ),
    },
  ]

  // Chế độ xem toàn trang Hợp đồng chuẩn A4 cho Quản lý / Nhân viên
  if (onlineContract) {
    const adminPreviewHtml = openContractInNewPage(onlineContract, user, {
      returnHtml: true, hideToolbar: true, profile: adminProfile || null, renewals: onlineRenewals,
    })
    let contractMonths = 1
    if (onlineContract.startDate && onlineContract.endDate) {
      const s = new Date(onlineContract.startDate)
      const e = new Date(onlineContract.endDate)
      contractMonths = Math.max(1, Math.round(Math.max(1, (e - s) / (1000 * 60 * 60 * 24)) / 30))
    }
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button size="sm" variant="secondary" onClick={() => setOnlineContract(null)}>
              <ArrowLeft size={15} /> Quay lại danh sách
            </Button>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Hợp Đồng Thuê Kho #{onlineContract.id} · {officialContractNumber(onlineContract)}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                Khách hàng: {onlineContract.customerName} · {onlineContract.signedAt ? `Đã ký lúc ${fmtDateTime(onlineContract.signedAt)}` : 'Chưa ký điện tử'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => openContract(onlineContract, user, { autoPrint: false, renewals: onlineRenewals })}>
              <ExternalLink size={15} /> Mở sang trang mới (Tab riêng)
            </Button>
            <Button size="sm" onClick={() => openContract(onlineContract, user, { autoPrint: true, renewals: onlineRenewals })}>
              <Printer size={15} /> Xuất PDF / In Hợp đồng (Có chữ ký)
            </Button>
          </div>
        </div>

        {/* Hợp đồng (xem trước đúng như bản in) */}
        <iframe title="Hợp đồng thuê kho" srcDoc={adminPreviewHtml}
          style={{ width: '100%', height: '88vh', minHeight: 760, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff' }} />
        {/* Staff / quản lý ký hộ khách tại quầy */}
        {['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(user?.role) && onlineContract.status === 'PENDING' && !onlineContract.signedAt && (
          <Card style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 6 }}>Khách ký trực tiếp tại quầy</h3>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Dùng khi khách đến gặp nhân viên. Có thể in bản mẫu trống cho khách ký tay, hoặc để khách ký ngay vào khung dưới đây.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Button size="sm" variant="secondary" onClick={() => openBlankContract(user)}><Printer size={14} /> In bản hợp đồng mẫu (trống)</Button>
              <Button as={Link} size="sm" variant="secondary" to={`/admin/contract-profiles/${onlineContract.reservationId}/fill`}>Điền hồ sơ hộ khách</Button>
            </div>
            <CounterSign contract={onlineContract} profile={adminProfile} onSigned={(u) => { setOnlineContract(u); reloadAll() }} />
          </Card>
        )}
        {['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(user?.role) && onlineContract.status === 'PENDING' && (
          <SignedScanCard contract={onlineContract} role={user.role} onChanged={(u) => { setOnlineContract(u); reloadAll() }} />
        )}
        {onlineContract.signedAtCounter && <p className="muted small" style={{ marginTop: 10 }}>Hợp đồng được ký trực tiếp tại quầy.</p>}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Quản Lý Đặt Chỗ, Hợp Đồng & Thanh Toán"
        subtitle={
          readOnly
            ? 'Chế độ xem (Business Manager): theo dõi đơn đặt chỗ, hợp đồng thuê kho, hợp đồng quá hạn và giao dịch thanh toán của mọi cơ sở.'
            : canAssignUnit
              ? 'Phân bổ ô kho cho đơn đặt chỗ, duyệt hợp đồng thuê kho điện tử, theo dõi hợp đồng quá hạn và xác nhận thanh toán.'
              : 'Tra cứu đơn đặt chỗ, xem hợp đồng thuê kho điện tử và xác nhận trạng thái thanh toán của khách hàng.'
        }
        actions={
          <Button variant="secondary" onClick={reloadAll}>
            <RefreshCw size={16} /> Làm mới dữ liệu
          </Button>
        }
      />

      <div className="tabs" role="tablist" style={{ marginBottom: 24 }}>
        <button className={`chip ${tab === 'RESERVATIONS' ? 'active' : ''}`} onClick={() => setTab('RESERVATIONS')}>
          Đơn đặt chỗ ({(reservations.data || []).length})
        </button>
        <button className={`chip ${tab === 'CONTRACTS' ? 'active' : ''}`} onClick={() => setTab('CONTRACTS')}>
          Hợp đồng thuê kho ({(contracts.data || []).length})
        </button>
        <button className={`chip ${tab === 'PAYMENTS' ? 'active' : ''}`} onClick={() => setTab('PAYMENTS')}>
          Giao dịch thanh toán ({visiblePayments.length})
        </button>
      </div>

      {tab === 'RESERVATIONS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Lọc theo trạng thái đơn" value={resStatusFilter} onChange={(e) => setResStatusFilter(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                {RESERVATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{RES_STATUS_VI[s] || s}</option>
                ))}
              </Select>
              {scopeFilters}
            </div>
          </Card>
          {reservations.loading ? (
            <LoadingState />
          ) : reservations.error ? (
            <ErrorState error={reservations.error} onRetry={reservations.reload} />
          ) : (
            <DataTable
              columns={reservationColumns}
              rows={(reservations.data || []).filter(byScope)}
              rowKey="id"
              empty={<EmptyState title="Không có đơn đặt chỗ nào" />}
            />
          )}
        </>
      )}

      {tab === 'CONTRACTS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Lọc theo trạng thái hợp đồng" value={contractStatusFilter} onChange={(e) => setContractStatusFilter(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>{CONTRACT_STATUS_VI[s] || s}</option>
                ))}
              </Select>
              {scopeFilters}
            </div>
          </Card>
          {contracts.loading ? (
            <LoadingState />
          ) : contracts.error ? (
            <ErrorState error={contracts.error} onRetry={contracts.reload} />
          ) : (
            <DataTable
              columns={contractColumns}
              rows={(contracts.data || []).filter(byScope)}
              rowKey="id"
              empty={<EmptyState title="Không có hợp đồng thuê kho nào" />}
            />
          )}
        </>
      )}

      {tab === 'PAYMENTS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Lọc theo trạng thái thanh toán" value={payStatusFilter} onChange={(e) => setPayStatusFilter(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PAY_STATUS_VI[s] || s}</option>
                ))}
              </Select>
              <Select label="Lọc theo loại khoản thu" value={payTypeFilter} onChange={(e) => setPayTypeFilter(e.target.value)}>
                <option value="">Tất cả loại khoản thu</option>
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{PAY_TYPE_VI[t] || t}</option>
                ))}
              </Select>
              <Input label="Từ ngày" type="date" value={payFrom} onChange={(e) => setPayFrom(e.target.value)} />
              <Input label="Đến ngày" type="date" value={payTo} onChange={(e) => setPayTo(e.target.value)} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 14 }}>
              <input type="checkbox" checked={showCancelledPay} onChange={(e) => setShowCancelledPay(e.target.checked)} />
              Hiện cả giao dịch của đơn đã hủy
            </label>
          </Card>
          {payments.loading ? (
            <LoadingState />
          ) : payments.error ? (
            <ErrorState error={payments.error} onRetry={payments.reload} />
          ) : (
            <DataTable
              columns={paymentColumns}
              rows={visiblePayments}
              rowKey="id"
              empty={<EmptyState title="Không có giao dịch thanh toán nào" />}
            />
          )}
        </>
      )}

      <InvoiceModal paymentId={invoiceId} onClose={() => setInvoiceId(null)} />

      {/* Modal Gán ô kho (Chỉ dành cho Facility Manager & Admin) */}
      <Modal
        open={!!selectedRes}
        title={selectedRes ? `Gán Ô Kho Cho Đơn Đặt Chỗ #${selectedRes.id}` : 'Gán Ô Kho'}
        onClose={() => setSelectedRes(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedRes(null)} disabled={busy}>
              Đóng
            </Button>
            <Button loading={busy} onClick={assignUnit}>
              Gán Ô Kho & Xác Nhận Đơn
            </Button>
          </>
        }
      >
        {selectedRes && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Cơ sở: <strong>{selectedRes.facilityName || `#${selectedRes.facilityId}`}</strong> · Loại kho khách đặt:{' '}
                <strong>{unitTypeLabel(selectedRes.unitTypeName) || `#${selectedRes.unitTypeId}`}</strong>
              </p>
            </div>
            <div className="span-2">
              <Select
                label="Chọn ô kho còn trống (AVAILABLE) phù hợp"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                hint={
                  loadingUnits
                    ? 'Đang tải danh sách ô kho trống…'
                    : availableUnits.length === 0
                      ? 'Hiện không có ô AVAILABLE nào thuộc loại này — bạn có thể nhập mã ID ô kho bên dưới.'
                      : `Đang có ${availableUnits.length} ô kho trống sẵn sàng bàn giao`
                }
              >
                <option value="">-- Chọn ô kho trống --</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    Ô {u.unitCode} ({u.floor ? `Tầng ${u.floor}` : ''}{u.location ? `, ${u.location}` : ''})
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Hoặc nhập mã ID ô kho trực tiếp"
                type="number"
                min="1"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!waiving}
        title={waiving ? `Miễn khoản phí #${waiving.id} (${PAY_TYPE_VI[waiving.paymentType] || waiving.paymentType})` : 'Miễn phí'}
        onClose={() => setWaiving(null)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setWaiving(null)} disabled={busy}>Hủy</Button>
            <Button loading={busy} onClick={waiveFee}>Xác nhận miễn phí</Button>
          </>
        )}
      >
        {waiving && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Khoản phí <strong>{money(waiving.amount)}</strong> của khách <strong>{waiving.customerName}</strong> sẽ được miễn, không còn phải thanh toán
              và không tính vào doanh thu. Khách sẽ nhận thông báo kèm lý do.
            </p>
            <Textarea label="Lý do miễn phí (bắt buộc)" maxLength={500} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
          </>
        )}
      </Modal>

      {/* Modal Phát sinh phí phụ thu / đền bù hư hại */}
      <Modal
        open={!!feeContract}
        title={feeContract ? `Tạo Phí Phát Sinh Cho Hợp Đồng #${feeContract.id} (Ô ${feeContract.unitCode})` : 'Tạo Phí Phát Sinh'}
        onClose={() => setFeeContract(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeeContract(null)} disabled={busy}>
              Hủy
            </Button>
            <Button loading={busy} onClick={submitExtraFee}>
              Phát Hành Hóa Đơn Phí
            </Button>
          </>
        }
      >
        {feeContract && (
          <div className="form-grid">
            <div className="span-2">
              <Select label="Loại phí phát sinh" value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                <option value="EXTRA_FEE">Phụ phí dịch vụ (Extra Fee)</option>
                <option value="DAMAGE_FEE">Phí đền bù hư hại (Damage Fee)</option>
                <option value="OVERDUE_FEE">Phí phạt quá hạn (Overdue Fee)</option>
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Số tiền (VNĐ) — để trống để tự lấy theo bảng giá PriceRule"
                type="number"
                min="1000"
                placeholder="VD: 200000"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </div>
            <div className="span-2">
              <Input
                label="Ghi chú / Lý do thu phí"
                placeholder="Nhập lý do thu phụ phí hoặc hư hại"
                value={feeNote}
                onChange={(e) => setFeeNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

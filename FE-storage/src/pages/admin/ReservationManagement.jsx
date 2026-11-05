import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Plus, X, CreditCard, RefreshCw, FileText, Printer, ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, RESERVATION_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import { maskContractCode, officialContractNumber, openContractInNewPage } from '../../utils/contractDocument.js'

const RES_STATUS_VI = {
  PENDING: 'Chờ duyệt & gán kho',
  ASSIGNED: 'Đã gán ô kho',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất bàn giao',
  CANCELLED: 'Đã hủy',
}

const CONTRACT_STATUS_VI = {
  PENDING: 'Chờ nhận kho (PENDING)',
  ACTIVE: 'Đang thuê (ACTIVE)',
  OVERDUE: 'Quá hạn (OVERDUE)',
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

  // Phân quyền: Chỉ Facility Manager và Admin (cùng Business Manager) mới có quyền phân bổ ô kho (Assign unit).
  // Facility Staff không có quyền phân kho nên ẩn nút Gán ô kho.
  const canAssignUnit = ['FACILITY_MANAGER', 'SYSTEM_ADMIN', 'BUSINESS_MANAGER'].includes(user?.role)

  const [tab, setTab] = useState('RESERVATIONS')
  const [resStatusFilter, setResStatusFilter] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState('')
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
  const [feeType, setFeeType] = useState('EXTRA_FEE')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeNote, setFeeNote] = useState('')

  // Xem Hợp đồng Online chuẩn khổ A4 & Chữ ký điện tử (đọc trực tiếp từ Backend)
  const [onlineContract, setOnlineContract] = useState(null)

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
      toast(`Đã gán ô kho và xác nhận đơn đặt chỗ #${selectedRes.id}! Hợp đồng chờ kích hoạt đã sẵn sàng cho nhân viên Check-in.`)
      setSelectedRes(null)
      setUnitId('')
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirmReservation = async (r) => {
    setBusy(true)
    try {
      await api.reservations.confirm(r.id)
      toast(`Đã xác nhận đơn đặt chỗ #${r.id}!`)
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

  const createContract = async (r) => {
    setBusy(true)
    try {
      await api.rentalContracts.createFromReservation(r.id)
      toast(`Đã tạo Hợp đồng thuê kho cho đơn #${r.id}!`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const activateContract = async (c) => {
    setBusy(true)
    try {
      await api.rentalContracts.activate(c.id)
      toast(`Đã kích hoạt Hợp đồng #${c.id} sang trạng thái ACTIVE!`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const markContractOverdue = async (c) => {
    setBusy(true)
    try {
      await api.rentalContracts.markOverdue(c.id)
      toast(`Đã đánh dấu quá hạn Hợp đồng #${c.id} và tự động phát hành phí phạt quá hạn!`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const processBatchOverdue = async () => {
    setBusy(true)
    try {
      const count = await api.rentalContracts.processOverdue()
      toast(`Đã quét xong: ${count} hợp đồng quá hạn đã được chuyển sang OVERDUE.`)
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

  const overdueCandidates = (allContracts.data || []).filter(
    (c) => c.status === 'OVERDUE' || c.overdue || (c.status === 'ACTIVE' && new Date(c.endDate) < new Date())
  )

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
            {r.unitTypeName || `Loại #${r.unitTypeId}`}
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
                onClick={() => {
                  setSelectedRes(r)
                  setUnitId(r.storageUnitId ? String(r.storageUnitId) : '')
                }}
              >
                {r.unitCode ? 'Đổi ô kho' : 'Gán ô kho'}
              </Button>
            )}
            {r.status === 'PENDING' && r.storageUnitId && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => confirmReservation(r)}>
                <CheckCircle2 size={14} /> Xác nhận
              </Button>
            )}
            {r.status === 'CONFIRMED' && r.storageUnitId && !r.rentalContractId && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => createContract(r)}>
                Tạo hợp đồng
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
    { key: 'status', header: 'Trạng thái', render: (c) => <Badge status={c.status}>{CONTRACT_STATUS_VI[c.status] || c.status}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => setOnlineContract(c)}>
            <FileText size={14} /> Xem HĐ Online
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openContractInNewPage(c, user, { autoPrint: false })}>
            <ExternalLink size={14} /> Mở trang HĐ
          </Button>
          {c.status === 'PENDING' && (
            <Button size="sm" loading={busy} onClick={() => activateContract(c)}>
              <CheckCircle2 size={14} /> Kích hoạt HĐ
            </Button>
          )}
          {canAssignUnit && c.status === 'ACTIVE' && (
            <Button size="sm" variant="danger-outline" loading={busy} onClick={() => markContractOverdue(c)}>
              <AlertTriangle size={14} /> Báo quá hạn
            </Button>
          )}
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
          <div className="cell-title">{PAY_TYPE_VI[p.paymentType] || p.paymentType}</div>
          <div className="cell-sub">
            {[p.rentalContractId && `Hợp đồng #${p.rentalContractId}`, p.reservationId && `Đơn #${p.reservationId}`, p.unitCode && `Ô ${p.unitCode}`, p.transactionReference && `Mã CK: ${p.transactionReference}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    { key: 'amount', header: 'Số tiền', render: (p) => <strong>{money(p.amount)}</strong> },
    { key: 'method', header: 'Phương thức', render: (p) => (p.paymentMethod ? METHOD_VI[p.paymentMethod] || p.paymentMethod : '—') },
    { key: 'status', header: 'Trạng thái', render: (p) => <Badge status={p.status}>{PAY_STATUS_VI[p.status] || p.status}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        p.status === 'PENDING' && (
          <Button size="sm" loading={busy} onClick={() => markPaymentPaid(p)}>
            <CreditCard size={14} /> Xác nhận đã thu
          </Button>
        ),
    },
  ]

  // Chế độ xem toàn trang Hợp đồng chuẩn A4 cho Quản lý / Nhân viên
  if (onlineContract) {
    let contractMonths = 1
    if (onlineContract.startDate && onlineContract.endDate) {
      const s = new Date(onlineContract.startDate)
      const e = new Date(onlineContract.endDate)
      contractMonths = Math.max(1, Math.round(Math.max(1, (e - s) / (1000 * 60 * 60 * 24)) / 30))
    }
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
            <Button size="sm" variant="secondary" onClick={() => openContractInNewPage(onlineContract, user, { autoPrint: false })}>
              <ExternalLink size={15} /> Mở sang trang mới (Tab riêng)
            </Button>
            <Button size="sm" onClick={() => openContractInNewPage(onlineContract, user, { autoPrint: true })}>
              <Printer size={15} /> Xuất PDF / In Hợp đồng (Có chữ ký)
            </Button>
          </div>
        </div>

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
                <div style={{ fontWeight: 700, display: 'inline-block', borderBottom: '1.5px solid #0f172a', paddingBottom: 3 }}>
                  Độc lập – Tự do – Hạnh phúc
                </div>
                <div style={{ marginTop: 6, fontStyle: 'italic', fontSize: 15 }}>
                  TP. Hồ Chí Minh, ngày lập: {fmtDate(onlineContract.createdAt || onlineContract.startDate)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', margin: '22px 0 24px' }}>
              <h2 style={{ fontFamily: '"Times New Roman", Times, Georgia, serif', fontSize: 26, fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', marginBottom: 6 }}>
                HỢP ĐỒNG CHO THUÊ KHO LƯU TRỮ HÀNG HÓA
              </h2>
              <div style={{ fontStyle: 'italic', fontSize: 16, color: '#334155' }}>
                (Mã hợp đồng: <strong>HĐ-#{onlineContract.id} ({maskContractCode(onlineContract)})</strong> · Đơn đặt chỗ: <strong>#{onlineContract.reservationId}</strong>)
              </div>
            </div>

            <div style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase', marginBottom: 6 }}>
                I. BÊN CHO THUÊ KHO (BÊN A): CÔNG TY TNHH HỆ THỐNG KHO VẬN SAFESPACE VIỆT NAM
              </div>
              <div>Cơ sở quản lý kho: <strong>{onlineContract.facilityName}</strong> · Mã số doanh nghiệp: <strong>0318689999</strong></div>
              <div>Đại diện pháp lý: <strong>Ban Giám Đốc Vận Hành SafeSpace</strong></div>
            </div>

            <div style={{ marginBottom: 20, padding: '14px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 17, textTransform: 'uppercase', marginBottom: 6 }}>
                II. BÊN THUÊ KHO (BÊN B): KHÁCH HÀNG
              </div>
              <div>Họ và tên khách hàng: <strong>{onlineContract.customerName}</strong> (Mã KH: #{onlineContract.customerId})</div>
              <div>Người đại diện ký kết: <strong>{onlineContract.signerName || onlineContract.customerName}</strong></div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 16 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Ô Kho Bàn Giao</th>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Thời Hạn Thuê</th>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Đơn Giá / Tháng</th>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Tiền Cọc (Đợt 1)</th>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Tổng Tiền Thuê (Đợt 2)</th>
                  <th style={{ border: '1px solid #334155', padding: '8px 10px', textAlign: 'left' }}>Trạng Thái</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                    <strong>Ô {onlineContract.unitCode}</strong> ({onlineContract.unitTypeName || 'Tiêu chuẩn'})
                  </td>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                    {fmtDate(onlineContract.startDate)} – {fmtDate(onlineContract.endDate)}
                  </td>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>{money(onlineContract.monthlyPrice)}</td>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}><strong>{money(onlineContract.depositAmount)}</strong></td>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                    <strong>{money(Number(onlineContract.monthlyPrice || 0) * contractMonths)}</strong>
                  </td>
                  <td style={{ border: '1px solid #334155', padding: '8px 10px' }}>
                    <strong>{CONTRACT_STATUS_VI[onlineContract.status] || onlineContract.status}</strong>
                  </td>
                </tr>
              </tbody>
            </table>

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
              <div style={{ textAlign: 'center', padding: 18, border: '1px solid #cbd5e1', borderRadius: 10, background: '#fcfcfd' }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>ĐẠI DIỆN BÊN A (SAFESPACE)</div>
                <div style={{ margin: '14px auto' }}>
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
                <div style={{ fontWeight: 700, fontSize: 17 }}>Ban Giám Đốc Vận Hành SafeSpace</div>
              </div>

              <div style={{ textAlign: 'center', padding: 18, border: '1px solid #cbd5e1', borderRadius: 10, background: '#fcfcfd' }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>ĐẠI DIỆN BÊN B (KHÁCH HÀNG)</div>
                {onlineContract.signedAt ? (
                  <div style={{ marginTop: 14 }}>
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
                      ✓ Đã ký lúc: {fmtDateTime(onlineContract.signedAt)}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 40 }} className="muted">
                    Khách hàng <strong>{onlineContract.customerName}</strong> chưa ký điện tử trên hợp đồng này.
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
        title="Quản Lý Đặt Chỗ, Hợp Đồng & Thanh Toán"
        subtitle={
          canAssignUnit
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
        <button className={`chip ${tab === 'OVERDUE' ? 'active' : ''}`} onClick={() => setTab('OVERDUE')}>
          Danh sách quá hạn ({overdueCandidates.length})
        </button>
        <button className={`chip ${tab === 'PAYMENTS' ? 'active' : ''}`} onClick={() => setTab('PAYMENTS')}>
          Giao dịch thanh toán ({(payments.data || []).length})
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
            </div>
          </Card>
          {reservations.loading ? (
            <LoadingState />
          ) : reservations.error ? (
            <ErrorState error={reservations.error} onRetry={reservations.reload} />
          ) : (
            <DataTable
              columns={reservationColumns}
              rows={reservations.data || []}
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
            </div>
          </Card>
          {contracts.loading ? (
            <LoadingState />
          ) : contracts.error ? (
            <ErrorState error={contracts.error} onRetry={contracts.reload} />
          ) : (
            <DataTable
              columns={contractColumns}
              rows={contracts.data || []}
              rowKey="id"
              empty={<EmptyState title="Không có hợp đồng thuê kho nào" />}
            />
          )}
        </>
      )}

      {tab === 'OVERDUE' && (
        <>
          <Card style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>Quản Lý Hợp Đồng Quá Hạn</h3>
              <p className="muted small">
                Đánh dấu các hợp đồng đã hết hạn sang trạng thái Quá hạn (OVERDUE) và tự động tính phí phạt quá hạn theo bảng giá.
              </p>
            </div>
            {canAssignUnit && (
              <Button onClick={processBatchOverdue} loading={busy}>
                <AlertTriangle size={16} /> Quét & Đánh dấu tất cả hợp đồng quá hạn
              </Button>
            )}
          </Card>
          {allContracts.loading ? (
            <LoadingState />
          ) : allContracts.error ? (
            <ErrorState error={allContracts.error} onRetry={allContracts.reload} />
          ) : (
            <DataTable
              columns={contractColumns}
              rows={allContracts.data || []}
              rowKey="id"
              empty={<EmptyState title="Không có hợp đồng nào" />}
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
            </div>
          </Card>
          {payments.loading ? (
            <LoadingState />
          ) : payments.error ? (
            <ErrorState error={payments.error} onRetry={payments.reload} />
          ) : (
            <DataTable
              columns={paymentColumns}
              rows={payments.data || []}
              rowKey="id"
              empty={<EmptyState title="Không có giao dịch thanh toán nào" />}
            />
          )}
        </>
      )}

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
                <strong>{selectedRes.unitTypeName || `#${selectedRes.unitTypeId}`}</strong>
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

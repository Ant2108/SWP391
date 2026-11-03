import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Plus, X, CreditCard, RefreshCw, FileText, Printer } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, RESERVATION_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'

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

const SIG_STORAGE_KEY = 'safespace_contract_signatures_v1'
function loadSignatures() {
  try {
    return JSON.parse(localStorage.getItem(SIG_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
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

  // Modal Xem Hợp đồng Online & Chữ ký điện tử
  const [onlineContract, setOnlineContract] = useState(null)
  const [signatures, setSignatures] = useState(() => loadSignatures())

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
    setSignatures(loadSignatures())
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
      await api.payments.markPaid(p.id, { paymentMethod: 'CASH', transactionReference: `XAC-NHAN-QUAY-${p.id}` })
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
        // Nếu là Nhân viên kho (FACILITY_STAFF) thì ẩn nút Gán ô kho (Assign unit) và các nút duyệt
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
        const signed = !!signatures[String(c.id)]
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
            {[p.rentalContractId && `Hợp đồng #${p.rentalContractId}`, p.reservationId && `Đơn #${p.reservationId}`, p.unitCode && `Ô ${p.unitCode}`]
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

  const currentSig = onlineContract ? signatures[String(onlineContract.id)] : null

  return (
    <>
      <PageHeader
        title="Quản Lý Đặt Chỗ, Hợp Đồng & Thanh Toán"
        subtitle={
          canAssignUnit
            ? 'Phân bổ ô kho cho đơn đặt chỗ, duyệt hợp đồng thuê kho điện tử, theo dõi hợp đồng quá hạn và xác nhận thanh toán.'
            : 'Tra cứu đơn đặt chỗ, xem hợp đồng thuê kho điện tử và theo dõi trạng thái thanh toán của khách hàng.'
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

      {/* Modal Xem Hợp đồng Thuê Kho Online & Chữ ký điện tử */}
      <Modal
        open={!!onlineContract}
        title={onlineContract ? `Hợp Đồng Thuê Kho Điện Tử #${onlineContract.id}` : 'Hợp đồng Online'}
        onClose={() => setOnlineContract(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> In / Xuất PDF Hợp đồng
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Độc lập – Tự do – Hạnh phúc</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>HỢP ĐỒNG CHO THUÊ KHO LƯU TRỮ TRỰC TUYẾN</div>
              <div className="small muted">
                Mã hợp đồng: <strong>HĐ-#{onlineContract.id}</strong> · Ngày lập: <strong>{fmtDate(onlineContract.createdAt || onlineContract.startDate)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <strong>BÊN CHO THUÊ (BÊN A): CÔNG TY TNHH HỆ THỐNG KHO TỰ QUẢN SAFESPACE</strong>
              <div>Cơ sở kho: <strong>{onlineContract.facilityName}</strong></div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <strong>BÊN THUÊ (BÊN B): KHÁCH HÀNG</strong>
              <div>Họ và tên khách hàng: <strong>{onlineContract.customerName}</strong></div>
            </div>

            <div style={{ marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div>Ô kho bàn giao: <strong>Ô {onlineContract.unitCode}</strong> ({onlineContract.unitTypeName || 'Tiêu chuẩn'})</div>
              <div>Thời hạn hợp đồng: <strong>{fmtDate(onlineContract.startDate)} – {fmtDate(onlineContract.endDate)}</strong></div>
              <div>Đơn giá thuê hàng tháng: <strong>{money(onlineContract.monthlyPrice)} / tháng</strong></div>
              <div>Tiền đặt cọc bảo đảm hợp đồng: <strong>{money(onlineContract.depositAmount)}</strong></div>
              <div>Trạng thái hợp đồng: <strong>{CONTRACT_STATUS_VI[onlineContract.status] || onlineContract.status}</strong></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid #cbd5e1' }}>
              <div style={{ textAlign: 'center', padding: 12, border: '1px dashed #94a3b8', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>ĐẠI DIỆN BÊN A (SAFESPACE)</div>
                <div style={{ margin: '12px auto', width: 130, padding: '8px 6px', border: '2px solid #dc2626', color: '#dc2626', borderRadius: 6, fontWeight: 700, fontSize: 11, transform: 'rotate(-4deg)', background: 'rgba(254,226,226,0.35)' }}>
                  ĐÃ KÝ SỐ BỞI<br />CÔNG TY TNHH<br />SAFESPACE STORAGE
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Ban Quản Lý SafeSpace</div>
              </div>

              <div style={{ textAlign: 'center', padding: 12, border: '1px dashed #94a3b8', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>ĐẠI DIỆN BÊN B (KHÁCH HÀNG)</div>
                {currentSig ? (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={currentSig.dataUrl}
                      alt="Chữ ký khách hàng"
                      style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4 }}
                    />
                    <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginTop: 4 }}>{currentSig.signerName}</div>
                    <div className="small muted">Đã ký lúc: {fmtDateTime(currentSig.signedAt)}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 18 }} className="muted small">
                    Khách hàng <strong>{onlineContract.customerName}</strong> có thể ký tên điện tử trực tiếp trong mục <em>Hợp đồng của tôi</em> trên tài khoản khách hàng.
                  </div>
                )}
              </div>
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

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Plus, X, CreditCard, RefreshCw, FileText, Printer, ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, RESERVATION_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
<<<<<<< Updated upstream
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import { maskContractCode, officialContractNumber, openContractInNewPage, parseRenewalMonths, sortRenewalsAscending } from '../../utils/contractDocument.js'

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
=======
import { fmtDate, fmtDateTime, label, money } from '../../utils/format.js'
import {
  CONTRACT_STATUS_TEXT,
  formatPaymentNote,
  officialContractNumber,
  openContractInNewPage,
  parseRenewalMonths,
  PAYMENT_METHOD_TEXT,
  PAYMENT_TYPE_TEXT,
  resolveInitialRentalTerms,
  sortRenewalsAscending,
} from '../../utils/contractDocument.js'
>>>>>>> Stashed changes

// Quản lý đặt chỗ, hợp đồng và thanh toán (Admin / Facility Manager / Facility Staff / Business Manager).
export default function ReservationManagement() {
  const { user } = useAuth()
  const toast = useToast()
  const { pathname } = useLocation()

  const canAssignUnit = ['FACILITY_MANAGER', 'SYSTEM_ADMIN'].includes(user?.role)
  const canFilterFacility = ['SYSTEM_ADMIN', 'BUSINESS_MANAGER'].includes(user?.role)
  const readOnly = user?.role === 'BUSINESS_MANAGER'

  const tabFromPath = pathname.endsWith('/rental-contracts') ? 'CONTRACTS'
    : pathname.endsWith('/payments') ? 'PAYMENTS'
      : pathname.endsWith('/overdue') ? 'OVERDUE'
        : readOnly ? 'CONTRACTS' : 'RESERVATIONS'
  const [tab, setTab] = useState(tabFromPath)
  useEffect(() => { setTab(tabFromPath) }, [tabFromPath])

  const [facilityFilter, setFacilityFilter] = useState('')
  const [resStatusFilter, setResStatusFilter] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('')
  const [payTypeFilter, setPayTypeFilter] = useState('')

  const [selectedRes, setSelectedRes] = useState(null)
  const [availableUnits, setAvailableUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [unitId, setUnitId] = useState('')
  const [busy, setBusy] = useState(false)

  const [feeContract, setFeeContract] = useState(null)
  const [feeType, setFeeType] = useState('EXTRA_FEE')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeNote, setFeeNote] = useState('')

  const [onlineContract, setOnlineContract] = useState(null)
  const [onlineRenewals, setOnlineRenewals] = useState([])

  const facilities = useAsync(() => (canFilterFacility ? api.facilities.list() : Promise.resolve([])), [canFilterFacility])
  const facParam = facilityFilter ? Number(facilityFilter) : undefined

  const reservations = useAsync(
    () => api.reservations.list({ facilityId: facParam, status: resStatusFilter || undefined }),
    [facParam, resStatusFilter]
  )
  const contracts = useAsync(
    () => api.rentalContracts.list({ facilityId: facParam, status: contractStatusFilter || undefined }),
    [facParam, contractStatusFilter]
  )
  const allContracts = useAsync(() => api.rentalContracts.list({ facilityId: facParam }), [facParam])
  const payments = useAsync(
    () => api.payments.list({ facilityId: facParam, status: payStatusFilter || undefined, paymentType: payTypeFilter || undefined }),
    [facParam, payStatusFilter, payTypeFilter]
  )

  const reloadAll = () => {
    reservations.reload()
    contracts.reload()
    allContracts.reload()
    payments.reload()
  }

  useEffect(() => {
<<<<<<< Updated upstream
    if (!onlineContract) {
      setOnlineRenewals([])
      return
    }
    api.payments
      .forContract(onlineContract.id)
      .then((list) => setOnlineRenewals(sortRenewalsAscending((list || []).filter((p) => p.paymentType === 'RENEWAL'))))
=======
    if (!onlineContract) { setOnlineRenewals([]); return }
    api.payments.forContract(onlineContract.id)
      .then((l) => setOnlineRenewals(sortRenewalsAscending((l || []).filter((p) => p.paymentType === 'RENEWAL'))))
>>>>>>> Stashed changes
      .catch(() => setOnlineRenewals([]))
  }, [onlineContract])

  useEffect(() => {
    if (!selectedRes) { setAvailableUnits([]); return }
    setLoadingUnits(true)
    api.storageUnits.search({ facilityId: selectedRes.facilityId, unitTypeId: selectedRes.unitTypeId, status: 'AVAILABLE' })
      .then((list) => {
        setAvailableUnits(list || [])
        if (list?.length && !selectedRes.storageUnitId) setUnitId(String(list[0].id))
      })
      .catch(() => setAvailableUnits([]))
      .finally(() => setLoadingUnits(false))
  }, [selectedRes])

  const assignUnit = async () => {
    if (!unitId) return toast('Please choose an available storage unit.', 'error')
    setBusy(true)
    try {
      await api.reservations.assignUnit(selectedRes.id, Number(unitId))
      toast(`Unit assigned and reservation #${selectedRes.id} confirmed!`)
      setSelectedRes(null)
      setUnitId('')
      reloadAll()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const confirmReservation = async (r) => {
    setBusy(true)
    try { await api.reservations.confirm(r.id); toast(`Reservation #${r.id} confirmed.`); reloadAll() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const cancelReservation = async (r) => {
    setBusy(true)
    try { await api.reservations.cancel(r.id); toast(`Reservation #${r.id} cancelled.`); reloadAll() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const createContract = async (r) => {
    setBusy(true)
    try { await api.rentalContracts.createFromReservation(r.id); toast(`Rental contract created for reservation #${r.id}.`); reloadAll() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const activateContract = async (c) => {
    setBusy(true)
<<<<<<< Updated upstream
    try {
      await api.rentalContracts.activate(c.id)
      toast(`Đã kích hoạt Hợp đồng #${c.id} sang trạng thái ACTIVE và đóng lịch nhận kho!`)
      reloadAll()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
=======
    try { await api.rentalContracts.activate(c.id); toast(`Contract #${c.id} activated and check-in completed.`); reloadAll() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
>>>>>>> Stashed changes
  }

  const markContractOverdue = async (c) => {
    setBusy(true)
    try { await api.rentalContracts.markOverdue(c.id); toast(`Contract #${c.id} marked overdue and fee issued.`); reloadAll() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const processBatchOverdue = async () => {
    setBusy(true)
    try {
      const count = await api.rentalContracts.processOverdue()
      toast(`Processed overdue scan: ${count} contract(s) marked overdue.`)
      reloadAll()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
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
      toast(`Issued ${PAYMENT_TYPE_TEXT[feeType] || label(feeType)} invoice for Contract #${feeContract.id}.`)
      setFeeContract(null)
      setFeeAmount('')
      setFeeNote('')
      reloadAll()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const markPaymentPaid = async (p) => {
    setBusy(true)
    try {
      const cleanRef = p.transactionReference && p.transactionReference !== 'DOT_2_THANH_TOAN_FULL_KHO'
        ? p.transactionReference
        : `COUNTER-${p.id}`
      await api.payments.markPaid(p.id, { paymentMethod: p.paymentMethod || 'CASH', transactionReference: cleanRef })
      toast(`Payment #${p.id} marked as paid.`)
      reloadAll()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const handleOpenContractRowInNewTab = async (c) => {
    let rens = []
    try {
      const list = await api.payments.forContract(c.id)
      rens = sortRenewalsAscending((list || []).filter((p) => p.paymentType === 'RENEWAL'))
<<<<<<< Updated upstream
    } catch {
      rens = []
    }
=======
    } catch { rens = [] }
>>>>>>> Stashed changes
    openContractInNewPage(c, user, { autoPrint: false, renewals: rens })
  }

  const overdueCandidates = (allContracts.data || []).filter(
    (c) => c.status === 'OVERDUE' || c.overdue || (c.status === 'ACTIVE' && new Date(c.endDate) < new Date())
  )

  const reservationColumns = [
    { key: 'id', header: 'Reservation', render: (r) => <><div className="cell-title">#{r.id}</div><div className="cell-sub">{fmtDateTime(r.createdAt)}</div></> },
    { key: 'customer', header: 'Customer', render: (r) => r.customerName || `Customer #${r.customerId}` },
    {
      key: 'unit',
      header: 'Unit & Facility',
      render: (r) => (
        <>
          <div className="cell-title">{r.unitTypeName || `Type #${r.unitTypeId}`}{r.unitCode ? ` · Unit ${r.unitCode}` : ' · Unassigned'}</div>
          <div className="cell-sub">{r.facilityName || `Facility #${r.facilityId}`}</div>
        </>
      ),
    },
    { key: 'period', header: 'Pickup / Duration', render: (r) => `${fmtDate(r.startDate)} · ${r.rentalMonths} mo` },
    {
      key: 'deposit',
      header: 'Deposit (Stage 1)',
      render: (r) => (
        <div>
          <div>{money(r.depositAmount)}</div>
          <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>{r.depositPaid ? 'Paid' : 'Unpaid'}</Badge>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status}>{label(r.status)}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (r) => {
        if (!canAssignUnit) return null
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && (
              <Button size="sm" onClick={() => { setSelectedRes(r); setUnitId(r.storageUnitId ? String(r.storageUnitId) : '') }}>
                {r.unitCode ? 'Change unit' : 'Assign unit'}
              </Button>
            )}
            {r.status === 'PENDING' && r.storageUnitId && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => confirmReservation(r)}>
                <CheckCircle2 size={14} /> Confirm
              </Button>
            )}
            {r.status === 'CONFIRMED' && r.storageUnitId && !r.rentalContractId && r.depositPaid && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => createContract(r)}>
                Create contract
              </Button>
            )}
            {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && (
              <Button size="sm" variant="danger-outline" loading={busy} onClick={() => cancelReservation(r)}>
                <X size={14} /> Cancel
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
      header: 'Contract',
      render: (c) => (
        <>
          <div className="cell-title">Contract #{c.id}</div>
          <div className="cell-sub">Reservation #{c.reservationId}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Badge tone={c.signedAt ? 'green' : 'yellow'}>{c.signedAt ? 'Signed' : 'Unsigned'}</Badge>
            <Badge tone={c.stage2RentalPaid ? 'green' : 'yellow'}>{c.stage2RentalPaid ? 'Rental paid' : 'Rental unpaid'}</Badge>
          </div>
        </>
      ),
    },
    { key: 'customer', header: 'Customer', render: (c) => c.customerName || `Customer #${c.customerId}` },
    {
      key: 'unit',
      header: 'Unit & Facility',
      render: (c) => (
        <>
          <div className="cell-title">Unit {c.unitCode || c.storageUnitId}</div>
          <div className="cell-sub">{c.facilityName || ''}</div>
        </>
      ),
    },
    { key: 'period', header: 'Period', render: (c) => `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}` },
    {
      key: 'rent',
      header: 'Monthly / Deposit',
      render: (c) => (
        <>
          <div>{money(c.monthlyPrice)} / mo</div>
          <div className="cell-sub">Deposit: {money(c.depositAmount)}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <>
          <Badge status={c.status}>{CONTRACT_STATUS_TEXT[c.status] || label(c.status)}</Badge>
          {c.overdue && c.status !== 'OVERDUE' && <div style={{ marginTop: 4 }}><Badge status="OVERDUE">Overdue</Badge></div>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => {
        const readyToActivate = !!c.signedAt && !!c.stage2RentalPaid
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button size="sm" variant="secondary" onClick={() => setOnlineContract(c)}>
              <FileText size={14} /> View
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleOpenContractRowInNewTab(c)}>
              <ExternalLink size={14} /> PDF
            </Button>
            {!readOnly && c.status === 'PENDING' && (
              <Button
                size="sm"
                loading={busy}
                disabled={!readyToActivate}
                title={readyToActivate ? 'Activate contract and complete check-in' : 'Requires customer signature and stage 2 rental payment'}
                onClick={() => activateContract(c)}
              >
                <CheckCircle2 size={14} /> {readyToActivate ? 'Activate' : 'Await sign & pay'}
              </Button>
            )}
            {canAssignUnit && c.status === 'ACTIVE' && (
              <Button size="sm" variant="danger-outline" loading={busy} onClick={() => markContractOverdue(c)}>
                <AlertTriangle size={14} /> Mark overdue
              </Button>
            )}
            {canAssignUnit && ['ACTIVE', 'OVERDUE'].includes(c.status) && (
              <Button size="sm" variant="secondary" onClick={() => { setFeeContract(c); setFeeType('EXTRA_FEE'); setFeeAmount(''); setFeeNote('') }}>
                <Plus size={14} /> Issue fee
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const paymentColumns = [
    { key: 'id', header: 'Payment', render: (p) => <><div className="cell-title">#{p.id}</div><div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div></> },
    { key: 'customer', header: 'Customer', render: (p) => p.customerName || `Customer #${p.customerId}` },
    {
      key: 'ref',
      header: 'Description',
      render: (p) => {
        const note = formatPaymentNote(p)
        return (
          <>
            <div className="cell-title">{PAYMENT_TYPE_TEXT[p.paymentType] || label(p.paymentType)}</div>
            <div className="cell-sub">
              {[
                p.rentalContractId && `Contract #${p.rentalContractId}`,
                p.reservationId && `Reservation #${p.reservationId}`,
                p.unitCode && `Unit ${p.unitCode}`,
                p.facilityName,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {note && <div className="cell-sub" style={{ fontWeight: 600 }}>{note.text}</div>}
          </>
        )
      },
    },
    { key: 'amount', header: 'Amount', render: (p) => <strong>{money(p.amount)}</strong> },
    { key: 'method', header: 'Method', render: (p) => (p.paymentMethod ? PAYMENT_METHOD_TEXT[p.paymentMethod] || label(p.paymentMethod) : '—') },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status}>{label(p.status)}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        !readOnly && p.status === 'PENDING' && (
          <Button size="sm" loading={busy} onClick={() => markPaymentPaid(p)}>
            <CreditCard size={14} /> Mark collected
          </Button>
        ),
    },
  ]

  if (onlineContract) {
    const { initialMonths: contractMonths, stage2Amount: contractStage2Amount } = resolveInitialRentalTerms(onlineContract)
    return (
      <>
        <PageHeader
          eyebrow={<button type="button" onClick={() => setOnlineContract(null)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to list</button>}
          title={`Contract #${onlineContract.id} (${officialContractNumber(onlineContract)})`}
          subtitle={`Customer: ${onlineContract.customerName} · ${onlineContract.signedAt ? `Signed on ${fmtDateTime(onlineContract.signedAt)}` : 'Waiting for customer signature'}`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => openContractInNewPage(onlineContract, user, { autoPrint: false, renewals: onlineRenewals })}>
                <ExternalLink size={14} /> Open A4 view
              </Button>
              <Button size="sm" onClick={() => openContractInNewPage(onlineContract, user, { autoPrint: true, renewals: onlineRenewals })}>
                <Printer size={14} /> Export PDF / Print
              </Button>
            </div>
          }
        />

        <Card style={{ padding: 28 }}>
          <div className="table-card" style={{ marginBottom: 20 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Assigned Unit</th>
                  <th>Rental Period</th>
                  <th>Monthly Rate</th>
                  <th>Deposit (Stage 1)</th>
                  <th>Initial Rental (Stage 2 · {contractMonths} mo)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Unit {onlineContract.unitCode}</strong> ({onlineContract.unitTypeName || 'Standard'})</td>
                  <td>{fmtDate(onlineContract.startDate)} → {fmtDate(onlineContract.endDate)}</td>
                  <td>{money(onlineContract.monthlyPrice)}</td>
                  <td><strong>{money(onlineContract.depositAmount)}</strong></td>
                  <td><strong>{money(contractStage2Amount)}</strong></td>
                  <td><Badge status={onlineContract.status}>{CONTRACT_STATUS_TEXT[onlineContract.status] || label(onlineContract.status)}</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>

          {onlineRenewals.length > 0 && (
            <div className="table-card" style={{ marginBottom: 20 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Addendum</th>
                    <th>Extended Duration</th>
                    <th>Renewal Fee</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {onlineRenewals.map((r, idx) => {
                    const m = parseRenewalMonths(r, onlineContract.monthlyPrice)
                    return (
                      <tr key={r.id || idx}>
                        <td><strong>Addendum #{idx + 1}</strong></td>
                        <td>+{m} month{m > 1 ? 's' : ''}</td>
                        <td><strong>{money(r.amount)}</strong></td>
                        <td>{fmtDateTime(r.paidAt || r.createdAt)}</td>
                        <td><Badge status={r.status}>{label(r.status)}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-2">
            <div style={{ textAlign: 'center', padding: 18, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontWeight: 700 }}>FOR PARTY A (SAFESPACE STORAGE)</div>
              <div style={{ margin: '14px auto', color: '#dc2626', fontWeight: 700, border: '2px dashed #dc2626', borderRadius: 8, padding: '14px 12px', maxWidth: 220, background: '#fff5f5' }}>
                SAFESPACE STORAGE<br />
                <span className="small" style={{ color: '#15803d' }}>✓ Verified Corporate Seal</span>
              </div>
              <div style={{ fontWeight: 600 }}>SafeSpace Operations Directorate</div>
            </div>
            <div style={{ textAlign: 'center', padding: 18, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontWeight: 700 }}>FOR PARTY B (CUSTOMER)</div>
              {onlineContract.signedAt ? (
                <div style={{ marginTop: 12 }}>
                  {onlineContract.signatureUrl && (
                    <img src={assetUrl(onlineContract.signatureUrl)} alt="Customer signature" style={{ height: 100, maxWidth: '100%', objectFit: 'contain', margin: '0 auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 6 }} />
                  )}
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{onlineContract.signerName || onlineContract.customerName}</div>
                  <div className="small" style={{ color: '#15803d', fontWeight: 600 }}>✓ Signed on {fmtDateTime(onlineContract.signedAt)}</div>
                </div>
<<<<<<< Updated upstream
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
                            <strong>{r.status === 'PAID' ? 'Đã thanh toán & Cộng hạn' : 'Chờ thanh toán'}</strong>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

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
=======
              ) : (
                <p className="muted" style={{ marginTop: 32 }}>Customer <strong>{onlineContract.customerName}</strong> has not signed this contract yet.</p>
              )}
>>>>>>> Stashed changes
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Reservations, Contracts & Payments"
        subtitle={
          readOnly
            ? 'Business Manager view (read-only): monitor reservations, rental contracts, overdue accounts, and payments across all facilities.'
            : canAssignUnit
              ? 'Assign storage units to reservations, review and activate rental contracts, manage overdue accounts, and confirm payments.'
              : 'View reservations and rental contracts, and confirm customer payments at your facility.'
        }
        actions={
          <Button variant="secondary" onClick={reloadAll}>
            <RefreshCw size={16} /> Refresh
          </Button>
        }
      />

      <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
        <button className={`chip ${tab === 'RESERVATIONS' ? 'active' : ''}`} onClick={() => setTab('RESERVATIONS')}>
          Reservations ({(reservations.data || []).length})
        </button>
        <button className={`chip ${tab === 'CONTRACTS' ? 'active' : ''}`} onClick={() => setTab('CONTRACTS')}>
          Contracts ({(contracts.data || []).length})
        </button>
        <button className={`chip ${tab === 'OVERDUE' ? 'active' : ''}`} onClick={() => setTab('OVERDUE')}>
          Overdue ({overdueCandidates.length})
        </button>
        <button className={`chip ${tab === 'PAYMENTS' ? 'active' : ''}`} onClick={() => setTab('PAYMENTS')}>
          Payments ({(payments.data || []).length})
        </button>
      </div>

      <div className="toolbar">
        {canFilterFacility && (
          <Select label="Facility" value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
            <option value="">All facilities</option>
            {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        )}
        {tab === 'RESERVATIONS' && (
          <Select label="Status" value={resStatusFilter} onChange={(e) => setResStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {RESERVATION_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        )}
        {tab === 'CONTRACTS' && (
          <Select label="Status" value={contractStatusFilter} onChange={(e) => setContractStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{CONTRACT_STATUS_TEXT[s] || label(s)}</option>)}
          </Select>
        )}
        {tab === 'OVERDUE' && canAssignUnit && (
          <Button onClick={processBatchOverdue} loading={busy}>
            <AlertTriangle size={16} /> Scan &amp; mark all expired contracts overdue
          </Button>
        )}
        {tab === 'PAYMENTS' && (
          <>
            <Select label="Status" value={payStatusFilter} onChange={(e) => setPayStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
            <Select label="Type" value={payTypeFilter} onChange={(e) => setPayTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_TEXT[t] || label(t)}</option>)}
            </Select>
          </>
        )}
      </div>

      {tab === 'RESERVATIONS' && (
        reservations.loading ? <LoadingState /> : reservations.error ? <ErrorState error={reservations.error} onRetry={reservations.reload} /> :
          <DataTable columns={reservationColumns} rows={reservations.data || []} rowKey="id" empty={<EmptyState title="No reservations found" />} />
      )}

      {tab === 'CONTRACTS' && (
        contracts.loading ? <LoadingState /> : contracts.error ? <ErrorState error={contracts.error} onRetry={contracts.reload} /> :
          <DataTable columns={contractColumns} rows={contracts.data || []} rowKey="id" empty={<EmptyState title="No rental contracts found" />} />
      )}

      {tab === 'OVERDUE' && (
        allContracts.loading ? <LoadingState /> : allContracts.error ? <ErrorState error={allContracts.error} onRetry={allContracts.reload} /> :
          <DataTable columns={contractColumns} rows={overdueCandidates} rowKey="id" empty={<EmptyState title="No overdue contracts" message="All active rental contracts are currently within their valid rental period." />} />
      )}

      {tab === 'PAYMENTS' && (
        payments.loading ? <LoadingState /> : payments.error ? <ErrorState error={payments.error} onRetry={payments.reload} /> :
          <DataTable columns={paymentColumns} rows={payments.data || []} rowKey="id" empty={<EmptyState title="No payments found" />} />
      )}

      <Modal
        open={!!selectedRes}
        title={selectedRes ? `Assign Unit to Reservation #${selectedRes.id}` : 'Assign Unit'}
        onClose={() => setSelectedRes(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedRes(null)} disabled={busy}>Cancel</Button>
            <Button loading={busy} disabled={!unitId || availableUnits.length === 0} onClick={assignUnit}>
              Assign Unit &amp; Confirm
            </Button>
          </>
        }
      >
        {selectedRes && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted" style={{ margin: 0 }}>
                Facility: <strong>{selectedRes.facilityName || `#${selectedRes.facilityId}`}</strong> · Requested unit type:{' '}
                <strong>{selectedRes.unitTypeName || `#${selectedRes.unitTypeId}`}</strong>
              </p>
            </div>
            <div className="span-2">
              <Select
                label="Available storage unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                hint={
                  loadingUnits
                    ? 'Loading available units…'
                    : availableUnits.length === 0
                      ? 'No AVAILABLE units of this type at this facility.'
                      : `${availableUnits.length} available unit(s) ready for assignment`
                }
              >
                <option value="">-- Select an available unit --</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitCode} ({[u.floor && `Floor ${u.floor}`, u.location].filter(Boolean).join(', ') || 'Standard'})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!feeContract}
        title={feeContract ? `Issue Fee for Contract #${feeContract.id} (Unit ${feeContract.unitCode})` : 'Issue Fee'}
        onClose={() => setFeeContract(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeeContract(null)} disabled={busy}>Cancel</Button>
            <Button loading={busy} onClick={submitExtraFee}>Issue Invoice</Button>
          </>
        }
      >
        {feeContract && (
          <div className="form-grid">
            <div className="span-2">
              <Select label="Fee type" value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                <option value="EXTRA_FEE">Extra service fee (EXTRA_FEE)</option>
                <option value="DAMAGE_FEE">Damage compensation fee (DAMAGE_FEE)</option>
                <option value="OVERDUE_FEE">Overdue fee (OVERDUE_FEE)</option>
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Amount (VND) — leave blank to use active PriceRule"
                type="number"
                min="1000"
                placeholder="e.g. 200000"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </div>
            <div className="span-2">
              <Input
                label="Note / reference"
                placeholder="Enter reason for fee"
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

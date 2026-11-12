import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, CreditCard, QrCode, Building2, PenTool, Printer, Eraser, CheckCircle2, ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Select, Input } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, assetUrl, CONTRACT_STATUSES } from '../../api/client.js'
<<<<<<< Updated upstream
import { fmtDate, fmtDateTime, money } from '../../utils/format.js'
import { CONTRACT_STATUS_VI, maskContractCode, officialContractNumber, openContractInNewPage, parseRenewalMonths, sortRenewalsAscending } from '../../utils/contractDocument.js'
=======
import { fmtDate, fmtDateTime, label, money } from '../../utils/format.js'
import {
  calcRenewalAmount,
  CONTRACT_STATUS_TEXT,
  formatPaymentNote,
  officialContractNumber,
  openContractInNewPage,
   parseRenewalMonths,
  PAYMENT_TYPE_TEXT,
  resolveInitialRentalTerms,
  sortRenewalsAscending,
} from '../../utils/contractDocument.js'
>>>>>>> Stashed changes

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Bank transfer 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'VNPay QR Gateway' },
  { value: 'MOMO', text: 'MoMo Wallet' },
]

// Quản lý hợp đồng thuê kho của khách hàng: ký tên điện tử, thanh toán hóa đơn Đợt 2, lập phụ lục gia hạn và xuất PDF.
export default function Contracts() {
  const { id: routeContractId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.rentalContracts.my())
  const priceRules = useAsync(() => api.priceRules.list({ active: true }).catch(() => []))

  const [renewTarget, setRenewTarget] = useState(null)
  const [months, setMonths] = useState(1)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [payNow, setPayNow] = useState(true)
  const [transferRef, setTransferRef] = useState('')
  const [busy, setBusy] = useState(false)

  const [invoiceTarget, setInvoiceTarget] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  const [onlineContract, setOnlineContract] = useState(null)
  const [onlineRenewals, setOnlineRenewals] = useState([])
  const [signerName, setSignerName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  // Tự mở chi tiết hợp đồng nếu điều hướng từ /account/contracts/:id (chuông thông báo, MyUnits, hoặc trang đơn đặt kho).
  useEffect(() => {
    if (routeContractId && data?.length) {
      const matched = data.find((c) => String(c.id) === String(routeContractId))
      if (matched) setOnlineContract(matched)
    }
  }, [routeContractId, data])

  useEffect(() => {
    if (!invoiceTarget) { setInvoices([]); return }
    setLoadingInvoices(true)
    api.payments.forContract(invoiceTarget.id).then((l) => setInvoices(l || [])).catch(() => setInvoices([])).finally(() => setLoadingInvoices(false))
  }, [invoiceTarget])

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
    if (!onlineContract) return
    setSignerName(onlineContract.signerName || onlineContract.customerName || user?.fullname || 'Customer')
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
  }, [onlineContract, user?.fullname])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: ((clientX - rect.left) * canvas.width) / rect.width, y: ((clientY - rect.top) * canvas.height) / rect.height }
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
    if (!drawingRef.current || !canvasRef.current) return
    if (e.cancelable) e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e, canvasRef.current)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const endDraw = () => { drawingRef.current = false }

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
      toast('Please draw your signature in the signature box before confirming.', 'error')
      return
    }
    const dataUrl = canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
    setSigning(true)
    try {
      const updated = await api.rentalContracts.sign(onlineContract.id, {
        signerName: (signerName || onlineContract.customerName || 'Customer').trim(),
        signatureUrl: dataUrl,
      })
      setOnlineContract(updated)
      reload()
      toast(`Contract #${onlineContract.id} signed! You can now export or print the PDF.`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSigning(false)
    }
  }

  const handleOpenOrPrintContract = (autoPrint = false) => {
    if (!onlineContract) return
    const draftSig = !onlineContract.signatureUrl && hasDrawn && canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
    openContractInNewPage(onlineContract, user, { autoPrint, fallbackSignatureUrl: draftSig, fallbackSignerName: signerName, renewals: onlineRenewals })
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

  const closeOnlineContractView = () => {
    setOnlineContract(null)
    if (routeContractId) navigate('/account/contracts', { replace: true })
  }

  const submitRenewal = async () => {
    if (!renewTarget) return
    setBusy(true)
    try {
      await api.rentalContracts.renew(renewTarget.id, { months: Number(months), paymentMethod: method, paid: false })
      if (payNow) {
        const contractPayments = await api.payments.forContract(renewTarget.id)
        const pendingRenewal = (contractPayments || []).find((p) => p.paymentType === 'RENEWAL' && p.status === 'PENDING')
        if (pendingRenewal) {
          await api.payments.simulateGateway(pendingRenewal.id, { paymentMethod: method, transactionReference: transferRef || undefined })
        }
      }
      toast(payNow ? `Contract #${renewTarget.id} renewed for +${months} month(s)!` : `Renewal invoice created for Contract #${renewTarget.id}.`)
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
      await api.payments.simulateGateway(payment.id, { paymentMethod: 'BANK_TRANSFER', transactionReference: `VIETQR-INV-${payment.id}` })
      toast('Invoice paid!')
      setInvoices((await api.payments.forContract(invoiceTarget.id)) || [])
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const allRows = data || []
  const rows = statusFilter ? allRows.filter((c) => c.status === statusFilter) : allRows

  const columns = [
    {
      key: 'id',
      header: 'Contract',
      render: (c) => (
        <>
          <div className="cell-title">Contract #{c.id}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Badge tone={c.signedAt ? 'green' : 'yellow'}>{c.signedAt ? 'Signed' : 'Unsigned'}</Badge>
            <Badge tone={c.stage2RentalPaid ? 'green' : 'yellow'}>{c.stage2RentalPaid ? 'Rental paid' : 'Rental unpaid'}</Badge>
          </div>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Unit & Facility',
      render: (c) => (
        <>
          <div className="cell-title">{c.unitTypeName ? `${c.unitTypeName} · ` : ''}Unit {c.unitCode || `#${c.storageUnitId}`}</div>
          <div className="cell-sub">{c.facilityName || `Facility #${c.facilityId}`}</div>
        </>
      ),
    },
    { key: 'period', header: 'Rental period', render: (c) => `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}` },
    { key: 'price', header: 'Price / month', render: (c) => money(c.monthlyPrice) },
    {
      key: 'deposit',
      header: 'Refundable deposit',
      render: (c) => (
        <div>
          <strong>{money(c.depositAmount)}</strong>
          <div className="cell-sub">{c.status === 'COMPLETED' ? 'Refunded after unit return' : 'Refunded on completion'}</div>
        </div>
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
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" variant={!c.signedAt && c.status === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setOnlineContract(c)}>
            <PenTool size={14} /> {c.signedAt ? 'View contract' : 'Sign contract'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleOpenContractRowInNewTab(c)}>
            <ExternalLink size={14} /> Print / PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setInvoiceTarget(c)}>
            <CreditCard size={14} /> Invoices
          </Button>
          {['ACTIVE', 'OVERDUE'].includes(c.status) && (
            <Button size="sm" variant="secondary" onClick={() => { setRenewTarget(c); setMonths(1); setMethod('BANK_TRANSFER'); setPayNow(true) }}>
              <CalendarPlus size={14} /> Renew
            </Button>
          )}
        </div>
      ),
    },
  ]

  const renewalCalc = renewTarget ? calcRenewalAmount(priceRules.data || [], renewTarget, months) : { amount: 0, rule: null }
  const renewEstimate = renewalCalc.amount
  const qrMemo = renewTarget ? `RENEW CONTRACT ${renewTarget.id} ${months}M` : ''
  const vietQrUrl = renewTarget
    ? `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${renewEstimate}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`
    : ''

  if (onlineContract) {
    const isSigned = !!onlineContract.signedAt
    const { initialMonths: contractMonths, stage2Amount: contractStage2Amount } = resolveInitialRentalTerms(onlineContract)
    const rawBaseRent = Number(onlineContract.monthlyPrice || 0) * contractMonths
    const discountDiff = rawBaseRent > contractStage2Amount ? rawBaseRent - contractStage2Amount : 0

    return (
      <>
        <PageHeader
          eyebrow={<button type="button" onClick={closeOnlineContractView} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to contracts</button>}
          title={`Rental Contract #${onlineContract.id} (${officialContractNumber(onlineContract)})`}
          subtitle={isSigned ? `Digitally signed by ${onlineContract.signerName || onlineContract.customerName} on ${fmtDateTime(onlineContract.signedAt)}` : 'Please review the terms below and sign electronically prior to check-in.'}
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => handleOpenOrPrintContract(false)}>
                <ExternalLink size={14} /> Open A4 view
              </Button>
              <Button size="sm" onClick={() => handleOpenOrPrintContract(true)}>
                <Printer size={14} /> Export PDF / Print
              </Button>
            </div>
          }
        />

        <Card style={{ padding: 28 }}>
          <div className="grid grid-2" style={{ marginBottom: 20 }}>
            <div style={{ padding: 14, background: 'var(--bg-soft, #f8fafc)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div className="field-label" style={{ marginBottom: 6 }}>Party A — Lessor (SafeSpace Storage)</div>
              <div className="small">Company: <strong>SAFESPACE STORAGE VIETNAM CO., LTD</strong></div>
              <div className="small">Facility: <strong>{onlineContract.facilityName}</strong></div>
              <div className="small">Bank account: <strong>0901000001 · MB Bank (SAFESPACE STORAGE)</strong></div>
            </div>
            <div style={{ padding: 14, background: 'var(--bg-soft, #f8fafc)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div className="field-label" style={{ marginBottom: 6 }}>Party B — Lessee (Customer)</div>
              <div className="small">Customer: <strong>{onlineContract.customerName || user?.fullname}</strong> (#{onlineContract.customerId || user?.id})</div>
              <div className="small">Reservation: <strong>#{onlineContract.reservationId}</strong></div>
              <div className="small">Authorized signer: <strong>{onlineContract.signerName || signerName || onlineContract.customerName}</strong></div>
            </div>
          </div>

          <h3 style={{ marginBottom: 10 }}>1. Assigned Storage Unit &amp; Two-Stage Payment Schedule</h3>
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
                  <td>
                    <strong>{money(contractStage2Amount)}</strong>
                    {discountDiff > 0 && <div className="cell-sub">Discount applied: -{money(discountDiff)}</div>}
                  </td>
                  <td><Badge status={onlineContract.status}>{CONTRACT_STATUS_TEXT[onlineContract.status] || label(onlineContract.status)}</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>

          {onlineRenewals.length > 0 && (
            <>
              <h3 style={{ marginBottom: 10 }}>2. Contract Renewal Addenda</h3>
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
                      const plNum = String(idx + 1).padStart(2, '0')
                      return (
                        <tr key={r.id || idx}>
<<<<<<< Updated upstream
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
=======
                          <td><strong>Addendum #{idx + 1}</strong></td>
                          <td>+{m} month{m > 1 ? 's' : ''}</td>
                          <td><strong>{money(r.amount)}</strong></td>
                          <td>{fmtDateTime(r.paidAt || r.createdAt)}</td>
                          <td><Badge status={r.status}>{label(r.status)}</Badge></td>
>>>>>>> Stashed changes
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="grid grid-2" style={{ marginTop: 20, alignItems: 'stretch' }}>
            <div style={{ textAlign: 'center', padding: 18, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-soft, #f8fafc)' }}>
              <div style={{ fontWeight: 700 }}>FOR PARTY A (SAFESPACE STORAGE)</div>
              <div className="small muted">Digitally signed upon contract issuance</div>
              <div style={{ margin: '14px auto', color: '#dc2626', fontWeight: 700, border: '2px dashed #dc2626', borderRadius: 8, padding: '18px 12px', maxWidth: 240, background: '#fff5f5' }}>
                SAFESPACE STORAGE<br />
                <span className="small" style={{ color: '#15803d' }}>✓ Verified Corporate Seal</span>
              </div>
              <div style={{ fontWeight: 600 }}>SafeSpace Operations Directorate</div>
            </div>

            <div style={{ textAlign: 'center', padding: 18, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-soft, #f8fafc)' }}>
              <div style={{ fontWeight: 700 }}>FOR PARTY B (CUSTOMER SIGNATURE)</div>
              {isSigned ? (
                <div style={{ marginTop: 12 }}>
                  {onlineContract.signatureUrl && (
                    <img src={assetUrl(onlineContract.signatureUrl)} alt="Customer signature" style={{ height: 110, maxWidth: '100%', objectFit: 'contain', margin: '0 auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 6 }} />
                  )}
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{onlineContract.signerName || onlineContract.customerName}</div>
                  <div className="small" style={{ color: '#15803d', fontWeight: 600 }}>
                    <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Signed on {fmtDateTime(onlineContract.signedAt)}
                  </div>
                </div>
              ) : onlineContract.status === 'PENDING' ? (
                <div style={{ marginTop: 10 }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>Draw your signature below:</div>
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={140}
                    onMouseDown={startDraw}
                    onMouseMove={moveDraw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={moveDraw}
                    onTouchEnd={endDraw}
                    style={{ width: '100%', height: 140, background: '#fff', border: '2px dashed #64748b', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }}
                  />
                  <div style={{ marginTop: 8, textAlign: 'left' }}>
                    <Input label="Signer full name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                    <Button size="sm" variant="secondary" onClick={clearCanvas} disabled={signing}><Eraser size={14} /> Clear</Button>
                    <Button size="sm" onClick={confirmDigitalSignature} loading={signing}><PenTool size={14} /> Confirm signature</Button>
                  </div>
                </div>
              ) : (
                <p className="muted small" style={{ marginTop: 28 }}>Only PENDING contracts can be signed.</p>
              )}
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Rental Contracts"
        subtitle="Sign your storage contract online, pay stage 2 rental invoices, renew your rental period, or export a printable A4 PDF."
        actions={<Button as={Link} to="/account/appointments" variant="secondary">Pickup appointments</Button>}
      />

      <div className="toolbar">
        <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {CONTRACT_STATUSES.map((s) => (
            <option key={s} value={s}>{CONTRACT_STATUS_TEXT[s] || label(s)}</option>
          ))}
        </Select>
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
          empty={<EmptyState title="No rental contracts yet" message="Your contract will appear here once your reservation deposit is paid and a storage unit is assigned." />}
        />
      )}

      <Modal
        wide
        open={!!invoiceTarget}
        title={invoiceTarget ? `Invoices for Contract #${invoiceTarget.id} (Unit ${invoiceTarget.unitCode})` : 'Contract Invoices'}
        onClose={() => setInvoiceTarget(null)}
        footer={<Button variant="secondary" onClick={() => setInvoiceTarget(null)}>Close</Button>}
      >
        {loadingInvoices ? (
          <LoadingState />
        ) : invoices.length === 0 ? (
          <p className="muted">No invoices found for this contract.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invoices.map((inv) => {
              const note = formatPaymentNote(inv)
              return (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 10, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>#{inv.id} · {PAYMENT_TYPE_TEXT[inv.paymentType] || label(inv.paymentType)} · {money(inv.amount)}</div>
                    <div className="small muted">{fmtDateTime(inv.paidAt || inv.createdAt)}{note ? ` · ${note.text}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge status={inv.status}>{label(inv.status)}</Badge>
                    {inv.status === 'PENDING' && (
                      <Button size="sm" loading={busy} onClick={() => payContractInvoice(inv)}>
                        <QrCode size={14} /> Pay now
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      <Modal
        wide
        open={!!renewTarget}
        title={renewTarget ? `Renew Contract #${renewTarget.id} (Unit ${renewTarget.unitCode})` : 'Renew Contract'}
        onClose={() => setRenewTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewTarget(null)} disabled={busy}>Cancel</Button>
            <Button loading={busy} onClick={submitRenewal}>
              {payNow ? `Pay & Renew Now (${money(renewEstimate)})` : 'Create Renewal Invoice'}
            </Button>
          </>
        }
      >
        {renewTarget && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted" style={{ margin: 0 }}>
                Current end date: <strong>{fmtDate(renewTarget.endDate)}</strong> · Applicable renewal rate:{' '}
                <strong>{money(Math.round(renewEstimate / Math.max(1, months)))} / month</strong>
                {renewalCalc.rule ? ' (Renewal price rule applied)' : ''}
              </p>
            </div>
            <Select label="Additional months (1 – 12)" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>
              ))}
            </Select>
            <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.text}</option>
              ))}
            </Select>
            <div className="span-2">
              <Select label="Payment option" value={payNow ? 'YES' : 'NO'} onChange={(e) => setPayNow(e.target.value === 'YES')}>
                <option value="YES">Pay online now ({money(renewEstimate)}) — Extend end date immediately</option>
                <option value="NO">Create pending renewal invoice only</option>
              </Select>
            </div>
            {payNow && (
              <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={vietQrUrl} alt="VietQR Renewal" style={{ width: 190, height: 190, objectFit: 'contain', background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)' }} />
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
                      <Building2 size={18} /> MB Bank · SAFESPACE STORAGE
                    </div>
                    <div className="small">Account: <strong>0901000001</strong></div>
                    <div className="small">Renewal amount: <strong>{money(renewEstimate)}</strong></div>
                    <div className="small" style={{ marginBottom: 10 }}>Note: <strong>{qrMemo}</strong></div>
                    <Input label="Transfer reference (optional)" placeholder="e.g. FT26305998877" value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
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

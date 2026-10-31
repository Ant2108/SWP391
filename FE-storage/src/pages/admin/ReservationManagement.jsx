import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Plus, X, CreditCard, RefreshCw } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, Modal, LoadingState, ErrorState, EmptyState, Input, Select } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, RESERVATION_STATUSES, CONTRACT_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from '../../api/client.js'
import { fmtDate, fmtDateTime, money, label } from '../../utils/format.js'

export default function ReservationManagement() {
  const toast = useToast()
  const [tab, setTab] = useState('RESERVATIONS') // RESERVATIONS | CONTRACTS | OVERDUE | PAYMENTS
  const [resStatusFilter, setResStatusFilter] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('')
  const [payTypeFilter, setPayTypeFilter] = useState('')

  // Modal Assign Unit
  const [selectedRes, setSelectedRes] = useState(null)
  const [availableUnits, setAvailableUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [unitId, setUnitId] = useState('')
  const [busy, setBusy] = useState(false)

  // Modal tạo Extra Fee / Damage Fee
  const [feeContract, setFeeContract] = useState(null)
  const [feeType, setFeeType] = useState('EXTRA_FEE')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeNote, setFeeNote] = useState('')

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
    if (!unitId) return toast('Please select an available storage unit', 'error')
    setBusy(true)
    try {
      await api.reservations.assignUnit(selectedRes.id, Number(unitId))
      toast(`Unit assigned and Reservation #${selectedRes.id} confirmed!`)
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
      toast(`Reservation #${r.id} confirmed!`)
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
      toast(`Reservation #${r.id} cancelled.`)
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
      toast(`Rental contract (PENDING) created for Reservation #${r.id}`)
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
      toast(`Contract #${c.id} marked OVERDUE and overdue fee payment generated!`)
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
      toast(`Processed expired contracts: ${count} contract(s) marked OVERDUE.`)
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
      toast(`${label(feeType)} invoice created for Contract #${feeContract.id}`)
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
      await api.payments.markPaid(p.id, { paymentMethod: 'CASH', transactionReference: `ADMIN-CONFIRMED-${p.id}` })
      toast(`Payment #${p.id} marked as PAID!`)
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
      header: 'Reservation',
      render: (r) => (
        <>
          <div className="cell-title">#{r.id}</div>
          <div className="cell-sub">{fmtDateTime(r.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => r.customerName || `User #${r.customerId}`,
    },
    {
      key: 'unit',
      header: 'Facility & Unit',
      render: (r) => (
        <>
          <div className="cell-title">
            {r.unitTypeName || `Type #${r.unitTypeId}`}
            {r.unitCode ? ` · Unit ${r.unitCode}` : ''}
          </div>
          <div className="cell-sub">{r.facilityName || `Facility #${r.facilityId}`}</div>
        </>
      ),
    },
    {
      key: 'period',
      header: 'Start / Term',
      render: (r) => `${fmtDate(r.startDate)} · ${r.rentalMonths} mo`,
    },
    {
      key: 'deposit',
      header: 'Deposit',
      render: (r) => (
        <div>
          <div>{money(r.depositAmount)}</div>
          <Badge status={r.depositPaid ? 'PAID' : 'PENDING'}>{r.depositPaid ? 'PAID' : 'PENDING'}</Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && !r.rentalContractId && (
            <Button
              size="sm"
              onClick={() => {
                setSelectedRes(r)
                setUnitId(r.storageUnitId ? String(r.storageUnitId) : '')
              }}
            >
              {r.unitCode ? 'Reassign unit' : 'Assign unit'}
            </Button>
          )}
          {r.status === 'PENDING' && r.storageUnitId && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => confirmReservation(r)}>
              <CheckCircle2 size={14} /> Confirm
            </Button>
          )}
          {r.status === 'CONFIRMED' && r.storageUnitId && !r.rentalContractId && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => createContract(r)}>
              Create Contract
            </Button>
          )}
          {['PENDING', 'ASSIGNED', 'CONFIRMED'].includes(r.status) && (
            <Button size="sm" variant="danger-outline" loading={busy} onClick={() => cancelReservation(r)}>
              <X size={14} /> Cancel
            </Button>
          )}
        </div>
      ),
    },
  ]

  const contractColumns = [
    { key: 'id', header: 'Contract', render: (c) => <><div className="cell-title">#{c.id}</div><div className="cell-sub">Res #{c.reservationId}</div></> },
    { key: 'customer', header: 'Customer', render: (c) => c.customerName || `User #${c.customerId}` },
    { key: 'unit', header: 'Unit & Facility', render: (c) => <><div className="cell-title">Unit {c.unitCode || c.storageUnitId}</div><div className="cell-sub">{c.facilityName || ''}</div></> },
    { key: 'period', header: 'Period', render: (c) => `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}` },
    { key: 'rent', header: 'Monthly / Deposit', render: (c) => <><div>{money(c.monthlyPrice)} / mo</div><div className="cell-sub">Dep: {money(c.depositAmount)}</div></> },
    { key: 'status', header: 'Status', render: (c) => <Badge status={c.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {c.status === 'ACTIVE' && (
            <Button size="sm" variant="danger-outline" loading={busy} onClick={() => markContractOverdue(c)}>
              <AlertTriangle size={14} /> Mark Overdue
            </Button>
          )}
          {['ACTIVE', 'OVERDUE'].includes(c.status) && (
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
              <Plus size={14} /> Issue Fee
            </Button>
          )}
        </div>
      ),
    },
  ]

  const paymentColumns = [
    { key: 'id', header: 'Payment', render: (p) => <><div className="cell-title">#{p.id}</div><div className="cell-sub">{fmtDateTime(p.paidAt || p.createdAt)}</div></> },
    { key: 'customer', header: 'Customer', render: (p) => p.customerName || `User #${p.customerId}` },
    {
      key: 'ref',
      header: 'Booking / Contract',
      render: (p) => (
        <>
          <div className="cell-title">{label(p.paymentType)}</div>
          <div className="cell-sub">
            {[p.rentalContractId && `Contract #${p.rentalContractId}`, p.reservationId && `Res #${p.reservationId}`, p.unitCode && `Unit ${p.unitCode}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ),
    },
    { key: 'amount', header: 'Amount', render: (p) => <strong>{money(p.amount)}</strong> },
    { key: 'method', header: 'Method', render: (p) => (p.paymentMethod ? label(p.paymentMethod) : '—') },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'actions',
      render: (p) =>
        p.status === 'PENDING' && (
          <Button size="sm" loading={busy} onClick={() => markPaymentPaid(p)}>
            <CreditCard size={14} /> Confirm Paid
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Reservations, Contracts & Payments"
        subtitle="Manage unit assignments, confirm bookings, monitor rental contracts, mark overdue contracts, and track payment statuses."
        actions={
          <Button variant="secondary" onClick={reloadAll}>
            <RefreshCw size={16} /> Refresh
          </Button>
        }
      />

      <div className="tabs" role="tablist" style={{ marginBottom: 24 }}>
        <button className={`chip ${tab === 'RESERVATIONS' ? 'active' : ''}`} onClick={() => setTab('RESERVATIONS')}>
          Reservations ({(reservations.data || []).length})
        </button>
        <button className={`chip ${tab === 'CONTRACTS' ? 'active' : ''}`} onClick={() => setTab('CONTRACTS')}>
          Rental Contracts ({(contracts.data || []).length})
        </button>
        <button className={`chip ${tab === 'OVERDUE' ? 'active' : ''}`} onClick={() => setTab('OVERDUE')}>
          Overdue List ({overdueCandidates.length})
        </button>
        <button className={`chip ${tab === 'PAYMENTS' ? 'active' : ''}`} onClick={() => setTab('PAYMENTS')}>
          Payment Status ({(payments.data || []).length})
        </button>
      </div>

      {tab === 'RESERVATIONS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Filter by status" value={resStatusFilter} onChange={(e) => setResStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {RESERVATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
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
              empty={<EmptyState title="No reservations found" />}
            />
          )}
        </>
      )}

      {tab === 'CONTRACTS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Filter by contract status" value={contractStatusFilter} onChange={(e) => setContractStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
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
              empty={<EmptyState title="No rental contracts found" />}
            />
          )}
        </>
      )}

      {tab === 'OVERDUE' && (
        <>
          <Card style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>Overdue Contract Management</h3>
              <p className="muted small">
                Mark active contracts as OVERDUE to automatically calculate and issue an OVERDUE_FEE payment from PriceRules.
              </p>
            </div>
            <Button onClick={processBatchOverdue} loading={busy}>
              <AlertTriangle size={16} /> Scan & Mark All Expired Contracts Overdue
            </Button>
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
              empty={<EmptyState title="No contracts to inspect" />}
            />
          )}
        </>
      )}

      {tab === 'PAYMENTS' && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div className="form-grid">
              <Select label="Filter by payment status" value={payStatusFilter} onChange={(e) => setPayStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
                ))}
              </Select>
              <Select label="Filter by fee type" value={payTypeFilter} onChange={(e) => setPayTypeFilter(e.target.value)}>
                <option value="">All fee types</option>
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{label(t)}</option>
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
              empty={<EmptyState title="No payment records found" />}
            />
          )}
        </>
      )}

      {/* Modal Assign Storage Unit */}
      <Modal
        open={!!selectedRes}
        title={selectedRes ? `Assign Storage Unit to Reservation #${selectedRes.id}` : 'Assign Storage Unit'}
        onClose={() => setSelectedRes(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedRes(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={assignUnit}>
              Assign Unit & Confirm
            </Button>
          </>
        }
      >
        {selectedRes && (
          <div className="form-grid">
            <div className="span-2">
              <p className="muted">
                Facility: <strong>{selectedRes.facilityName || `#${selectedRes.facilityId}`}</strong> · Requested Type:{' '}
                <strong>{selectedRes.unitTypeName || `#${selectedRes.unitTypeId}`}</strong>
              </p>
            </div>
            <div className="span-2">
              <Select
                label="Available storage units matching facility & unit type"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                hint={
                  loadingUnits
                    ? 'Loading available units…'
                    : availableUnits.length === 0
                      ? 'No AVAILABLE units found for this type — you can also enter a Storage Unit ID below.'
                      : `${availableUnits.length} unit(s) available`
                }
              >
                <option value="">Select an available unit…</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitCode} (ID #{u.id}{u.floor ? `, Floor ${u.floor}` : ''}{u.location ? `, ${u.location}` : ''})
                  </option>
                ))}
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Or enter Storage Unit ID directly"
                type="number"
                min="1"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Issue Extra Fee / Damage Fee */}
      <Modal
        open={!!feeContract}
        title={feeContract ? `Issue Fee for Contract #${feeContract.id} (Unit ${feeContract.unitCode})` : 'Issue Fee'}
        onClose={() => setFeeContract(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeeContract(null)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitExtraFee}>
              Create Fee Invoice
            </Button>
          </>
        }
      >
        {feeContract && (
          <div className="form-grid">
            <div className="span-2">
              <Select label="Fee type" value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                <option value="EXTRA_FEE">Extra Fee</option>
                <option value="DAMAGE_FEE">Damage Fee</option>
                <option value="OVERDUE_FEE">Overdue Fee</option>
              </Select>
            </div>
            <div className="span-2">
              <Input
                label="Amount (VND) — leave blank to use current PriceRule default"
                type="number"
                min="1000"
                placeholder="e.g. 200000"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </div>
            <div className="span-2">
              <Input
                label="Note / Reference"
                placeholder="Reason for extra or damage fee"
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

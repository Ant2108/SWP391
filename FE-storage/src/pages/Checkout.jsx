import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, QrCode, MapPin, Ruler, CalendarCheck, Building2, ShieldAlert, Tag } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'
import { canBook, groupByDistrict } from '../utils/facility.js'
import { todayIso } from '../utils/pricing.js'
import { calcRentalTotal, calcDepositAmount } from '../utils/contractDocument.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Bank transfer 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'VNPay QR Gateway' },
  { value: 'MOMO', text: 'MoMo Wallet' },
  { value: 'CASH', text: 'Pay deposit later (hold order for 24 hours)' },
]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const maxStartIso = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// Trang đặt thuê kho: tính giá khớp 100% với ReservationService (gồm RENTAL + DISCOUNT + DEPOSIT).
export default function Checkout() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const bookableFacilities = (facilities.data || []).filter(canBook)
  const initialFacilityId = Number(params.get('facility')) || ''
  const initialUnitTypeId = Number(params.get('unitType')) || ''

  const [selectedFacilityId, setSelectedFacilityId] = useState(initialFacilityId)
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState(initialUnitTypeId)

  useEffect(() => {
    if (bookableFacilities.length) {
      if (!selectedFacilityId || !bookableFacilities.some((f) => f.id === Number(selectedFacilityId))) {
        setSelectedFacilityId(bookableFacilities[0].id)
      }
    }
  }, [bookableFacilities, selectedFacilityId])

  const facilityId = Number(selectedFacilityId) || 0
  const unitTypes = useAsync(
    () => (facilityId ? api.unitTypes.listByFacility(facilityId) : Promise.resolve([])),
    [facilityId]
  )

  useEffect(() => {
    if (unitTypes.data?.length) {
      const activeTypes = unitTypes.data.filter((t) => t.active)
      if (!selectedUnitTypeId || !activeTypes.some((t) => t.id === Number(selectedUnitTypeId))) {
        setSelectedUnitTypeId(activeTypes[0]?.id || '')
      }
    }
  }, [unitTypes.data, selectedUnitTypeId])

  const unitTypeId = Number(selectedUnitTypeId) || 0

  const { data, loading, error, reload } = useAsync(async () => {
    if (!facilityId || !unitTypeId) return null
    const [facility, types, units, allRules] = await Promise.all([
      api.facilities.get(facilityId),
      api.unitTypes.listByFacility(facilityId),
      api.storageUnits.search({ facilityId, unitTypeId, status: 'AVAILABLE' }),
      api.priceRules.list({ active: true }).catch(() => []),
    ])
    return { facility, unitType: types.find((t) => t.id === unitTypeId), units, allRules: allRules || [] }
  }, [facilityId, unitTypeId])

  const [months, setMonths] = useState(1)
  const [startDate, setStartDate] = useState(todayIso())
  const [payStageMode, setPayStageMode] = useState('STAGE1_DEPOSIT')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [transferRef, setTransferRef] = useState('')
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)

  const back = (
    <Link to={facilityId ? `/storage-options?facility=${facilityId}` : '/storage-options'}>
      <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to storage options
    </Link>
  )

  if (facilities.loading || loading) {
    return <section className="section"><div className="container"><LoadingState /></div></section>
  }
  if (facilities.error || error) {
    return <section className="section"><div className="container"><ErrorState error={facilities.error || error} onRetry={reload} /></div></section>
  }
  if (!bookableFacilities.length) {
    return (
      <section className="section">
        <div className="container">
          <EmptyState title="No available facilities" message="No storage facilities are currently open for booking." />
        </div>
      </section>
    )
  }

  const facility = data?.facility
  const unitType = data?.unitType
  const units = data?.units || []
  const allRules = data?.allRules || []

  const calcDate = startDate && startDate >= todayIso() ? startDate : todayIso()
  const rentalCalc = calcRentalTotal(allRules, facilityId, unitTypeId, months, calcDate)
  const stage2FullRental = rentalCalc.finalTotal
  const baseRentalTotal = rentalCalc.baseTotal
  const discountAmount = rentalCalc.discountAmount
  const discountRule = rentalCalc.discountRule
  const monthly = rentalCalc.effectiveMonthly

  const depositCalc = calcDepositAmount(allRules, facilityId, unitTypeId, stage2FullRental, calcDate)
  const stage1Deposit = depositCalc.amount
  const depositNote = depositCalc.note

  const totalBothStages = stage1Deposit + stage2FullRental
  const canSubmit = !!facility && canBook(facility) && !!unitType && units.length > 0
  const dims = unitType ? [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ') : ''
  const qrMemo = `DEPOSIT ${unitType?.typeName || 'UNIT'} FAC${facilityId}`
  const vietQrUrl = `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${stage1Deposit}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`

  const submitReservation = async (e) => {
    e.preventDefault()
    setError2('')
    if (startDate < todayIso() || startDate > maxStartIso()) {
      setError2(`Pickup date must be between today (${todayIso()}) and one month from today (${maxStartIso()}).`)
      return
    }
    setPaying(true)
    try {
      const reservation = await api.reservations.create({
        facilityId: Number(facilityId),
        unitTypeId: Number(unitTypeId),
        startDate,
        rentalMonths: Number(months),
      })

      if (payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH') {
        const refCode = transferRef || `${method}-DEP-${reservation.id}`
        let paymentId = reservation.pendingDepositPaymentId
        if (!paymentId) {
          const createdPay = await api.payments.create({
            reservationId: reservation.id,
            paymentType: 'DEPOSIT',
            paymentMethod: method,
            transactionReference: refCode,
            paid: false,
          })
          paymentId = createdPay.id
        }
        await api.payments.simulateGateway(paymentId, {
          paymentMethod: method,
          transactionReference: refCode,
        })
<<<<<<< Updated upstream
        toast(`Đã thanh toán thành công Đợt 1 (cọc ${money(stage1Deposit)})! Đơn đặt kho đang chờ Quản lý cơ sở duyệt và gán ô kho để phát hành hợp đồng.`)
=======
        toast(`Stage 1 deposit (${money(reservation.depositAmount ?? stage1Deposit)}) paid! A facility manager will assign your unit shortly.`)
>>>>>>> Stashed changes
      } else {
        toast('Reservation created! Please complete your stage 1 deposit within 24 hours to hold the unit.')
      }

      navigate(`/account/reservations/${reservation.id}`, { replace: true })
    } catch (err) {
      setError2(err.message || 'Booking failed')
      setPaying(false)
    }
  }

  return (
    <section className="section">
      <div className="container">
        <PageHeader
          eyebrow={back}
          title="Reserve a Storage Unit"
          subtitle="Choose your facility, unit size, pickup date (within 1 month), and complete the stage 1 deposit to hold your unit."
        />
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <form onSubmit={submitReservation}>
            <Card>
              <h3 style={{ marginBottom: 16 }}>1. Reservation details</h3>
              <div className="form-grid">
                <Select
                  label="Facility"
                  value={selectedFacilityId}
                  onChange={(e) => {
                    const nextFac = Number(e.target.value)
                    setSelectedFacilityId(nextFac)
                    setSelectedUnitTypeId('')
                    setParams({ facility: nextFac })
                  }}
                >
                  {groupByDistrict(bookableFacilities).map((g) => (
                    <optgroup key={g.district} label={g.district}>
                      {g.items.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <Select
                  label="Unit type"
                  value={selectedUnitTypeId}
                  onChange={(e) => {
                    const nextType = Number(e.target.value)
                    setSelectedUnitTypeId(nextType)
                    setParams({ facility: facilityId, unitType: nextType })
                  }}
                >
                  {(unitTypes.data || []).filter((t) => t.active).map((t) => (
                    <option key={t.id} value={t.id}>{t.typeName}</option>
                  ))}
                </Select>
                <Select label="Rental duration" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>
                  ))}
                </Select>
                <Input
                  label="Pickup date (up to 1 month from today)"
                  type="date"
                  required
                  min={todayIso()}
                  max={maxStartIso()}
                  hint={`Between ${todayIso()} and ${maxStartIso()}`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <h3 style={{ margin: '28px 0 16px' }}>2. Stage 1 — Security deposit ({money(stage1Deposit)})</h3>
              <div className="form-grid">
                <div className="span-2">
                  <Select label="Payment option" value={payStageMode} onChange={(e) => setPayStageMode(e.target.value)}>
                    <option value="STAGE1_DEPOSIT">Pay stage 1 deposit ({money(stage1Deposit)}) now</option>
                    <option value="NOT_PAID_24H">Reserve first — Pay deposit within 24 hours</option>
                  </Select>
                </div>

                {payStageMode === 'STAGE1_DEPOSIT' && (
                  <>
                    <div className="span-2">
                      <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.text}</option>
                        ))}
                      </Select>
                    </div>

                    {method !== 'CASH' && (
                      <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 18, borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                          <img src={vietQrUrl} alt="VietQR" style={{ width: 200, height: 200, objectFit: 'contain', background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--border)' }} />
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
                              <Building2 size={18} /> SafeSpace Storage · MB Bank
                            </div>
                            <div className="small">Account number: <strong>0901000001</strong></div>
                            <div className="small">Deposit amount: <strong>{money(stage1Deposit)}</strong></div>
                            <div className="small" style={{ marginBottom: 10 }}>Transfer note: <strong>{qrMemo}</strong></div>
                            <Input
                              label="Transfer reference (optional)"
                              placeholder="e.g. FT26305123456"
                              autoComplete="off"
                              value={transferRef}
                              onChange={(e) => setTransferRef(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {(payStageMode === 'NOT_PAID_24H' || method === 'CASH') && (
                  <p className="span-2 muted small">
                    Your reservation will be held for <strong>24 hours</strong> while awaiting the stage 1 deposit payment.
                  </p>
                )}
              </div>

              {error2 && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error2}</div>}
              {!canSubmit && (
                <div className="form-alert" role="alert" style={{ marginTop: 16 }}>
                  No available units for this size at the selected facility.{' '}
                  <Link to="/storage-options" style={{ textDecoration: 'underline' }}>Choose another unit type</Link>
                </div>
              )}

              <Button type="submit" size="lg" loading={paying} disabled={!canSubmit} style={{ marginTop: 24, width: '100%' }}>
                {payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? (
                  <><QrCode size={18} /> Pay Deposit ({money(stage1Deposit)}) &amp; Reserve</>
                ) : (
                  <><CalendarCheck size={18} /> Reserve Unit (Pay Deposit Within 24h)</>
                )}
              </Button>
            </Card>
          </form>

          {unitType && facility && (
            <Card className="loc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>{unitType.typeName}</h3>
                <Badge tone={units.length ? 'green' : 'neutral'}>
                  {units.length ? `${units.length} available` : 'Booked'}
                </Badge>
              </div>
              <div className="meta"><MapPin size={18} /><span>{facility.name} · {facility.address}</span></div>
              {(unitType.sizeDescription || dims) && (
                <div className="meta"><Ruler size={18} /><span>{unitType.sizeDescription || `${dims} m`}</span></div>
              )}
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />

              {discountAmount > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }} className="muted">
                    <span>Standard price ({months} month{months > 1 ? 's' : ''})</span>
                    <span style={{ textDecoration: 'line-through' }}>{money(baseRentalTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#15803d', fontWeight: 600 }}>
                    <span>
                      <Tag size={14} style={{ verticalAlign: -2 }} /> Active discount (
                      {discountRule?.calculationType === 'PERCENTAGE' ? `-${discountRule.percentage}%` : 'Promo'})
                    </span>
                    <span>-{money(discountAmount)}</span>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>Stage 1:</strong> Security deposit ({depositNote})</span>
                <strong>{money(stage1Deposit)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>Stage 2:</strong> Rental payment ({months} mo × {money(monthly)})</span>
                <strong>{money(stage2FullRental)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                <span>Total (Stage 1 + Stage 2 · Deposit refunded on return)</span>
                <strong>{money(totalBothStages)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
                <span>Due now (Stage 1)</span>
                <span>{payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? money(stage1Deposit) : `${money(0)} (Due within 24h)`}</span>
              </div>

              <div style={{ background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                  <ShieldAlert size={16} /> Deposit &amp; pickup policy:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                  <li><strong>Stage 1 deadline:</strong> Pay the deposit within <strong>24 hours</strong> of booking.</li>
                  <li><strong>Pickup window:</strong> Up to <strong>1 month</strong> from booking (latest pickup: <strong>{maxStartIso()}</strong>).</li>
                  <li><strong>Cancel &gt; 10 days before deadline:</strong> <strong>100% deposit refund ({money(stage1Deposit)})</strong>.</li>
                  <li><strong>Cancel or check in within the final 10 days:</strong> 20% fee deducted, <strong>80% deposit ({money(Math.round(stage1Deposit * 0.8))})</strong> refunded.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, MapPin, Ruler, CalendarCheck, Check } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { canBook } from '../utils/facility.js'
import { money, label } from '../utils/format.js'

const METHODS = ['CARD', 'BANK_TRANSFER']
const MONTHS = [1, 2, 3, 6, 12]
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Quy đổi price rule về số tiền: RENTAL -> mỗi tháng, DEPOSIT -> một lần. */
function amountOf(rule, monthly) {
  if (!rule) return null
  if (rule.calculationType === 'PERCENTAGE') return monthly != null ? Math.round((monthly * Number(rule.percentage)) / 100) : null
  if (rule.calculationType === 'PER_DAY') return Number(rule.amount) * 30
  return Number(rule.amount)
}

export default function Checkout() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const initialFacilityId = Number(params.get('facility')) || ''
  const initialUnitTypeId = Number(params.get('unitType')) || ''

  const [selectedFacilityId, setSelectedFacilityId] = useState(initialFacilityId)
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState(initialUnitTypeId)

  useEffect(() => {
    if (!selectedFacilityId && facilities.data?.length) {
      setSelectedFacilityId(facilities.data[0].id)
    }
  }, [facilities.data, selectedFacilityId])

  const facilityId = Number(selectedFacilityId) || 0
  const unitTypes = useAsync(
    () => (facilityId ? api.unitTypes.listByFacility(facilityId) : Promise.resolve([])),
    [facilityId]
  )

  useEffect(() => {
    if (unitTypes.data?.length) {
      const activeTypes = unitTypes.data.filter((t) => t.active)
      if (!selectedUnitTypeId || !activeTypes.some((t) => t.id === Number(selectedUnitTypeId))) {
        const firstId = activeTypes[0]?.id || ''
        setSelectedUnitTypeId(firstId)
      }
    }
  }, [unitTypes.data, selectedUnitTypeId])

  const unitTypeId = Number(selectedUnitTypeId) || 0

  const { data, loading, error, reload } = useAsync(async () => {
    if (!facilityId || !unitTypeId) return null
    const [facility, types, units, rent, dep] = await Promise.all([
      api.facilities.get(facilityId),
      api.unitTypes.listByFacility(facilityId),
      api.storageUnits.search({ facilityId, unitTypeId, status: 'AVAILABLE' }),
      api.priceRules.current({ priceType: 'RENTAL', facilityId, unitTypeId }).catch(() => null),
      api.priceRules.current({ priceType: 'DEPOSIT', facilityId, unitTypeId }).catch(() => null),
    ])
    const unitType = types.find((t) => t.id === unitTypeId)
    const monthly = amountOf(rent, null) ?? 1000000
    const deposit = amountOf(dep, monthly) ?? Math.round(monthly * 0.5)
    return { facility, unitType, units, monthly, deposit }
  }, [facilityId, unitTypeId])

  const [months, setMonths] = useState(1)
  const [startDate, setStartDate] = useState(todayIso())
  const [payDepositNow, setPayDepositNow] = useState(true)
  const [method, setMethod] = useState('CARD')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' })
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)
  const setC = (k) => (e) => setCard({ ...card, [k]: e.target.value })

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
  if (!facilities.data?.length) {
    return (
      <section className="section">
        <div className="container">
          <EmptyState title="No active facilities" message="No storage facilities are available right now." />
        </div>
      </section>
    )
  }

  const facility = data?.facility
  const unitType = data?.unitType
  const units = data?.units || []
  const monthly = data?.monthly ?? 1000000
  const deposit = data?.deposit ?? Math.round(monthly * 0.5)
  const rentEstimate = monthly * months
  const canSubmit = !!facility && !!unitType && units.length > 0 && canBook(facility)
  const dims = unitType ? [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ') : ''

  const submitReservation = async (e) => {
    e.preventDefault()
    setError2('')
    if (payDepositNow && method === 'CARD' && card.number.replace(/\s/g, '').length < 8) {
      setError2('Please enter a valid card number (at least 8 digits).')
      return
    }
    setPaying(true)
    try {
      // 1. Tạo Reservation thật trên Backend (POST /api/reservations)
      const reservation = await api.reservations.create({
        facilityId: Number(facilityId),
        unitTypeId: Number(unitTypeId),
        startDate,
        rentalMonths: Number(months),
      })

      // 2. Nếu khách chọn đóng cọc: khởi tạo hóa đơn PENDING (BE tự tính tiền), sau đó cổng thanh toán xác nhận PAID
      if (payDepositNow) {
        const pendingDeposit = await api.payments.create({
          reservationId: reservation.id,
          paymentType: 'DEPOSIT',
          paymentMethod: method,
          transactionReference: `DEP-RSV-${reservation.id}-${Date.now()}`,
        })
        await api.payments.markPaid(pendingDeposit.id, {
          paymentMethod: method,
          transactionReference: `GATEWAY-RSV-${reservation.id}-${Date.now()}`,
        })
        toast('Reservation created and deposit confirmed! A manager will assign your unit shortly.')
      } else {
        toast('Reservation created! Once a manager assigns and confirms your unit, you can complete the deposit payment.')
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
          subtitle="Choose your facility, unit size, start date, and rental duration."
        />
        <ol className="stepper" aria-label="Booking steps">
          <li className="done"><span className="dot"><Check size={16} /></span> Choose a unit</li>
          <span className="bar" aria-hidden="true" />
          <li className="current" aria-current="step"><span className="dot">2</span> Reserve and pay deposit</li>
          <span className="bar" aria-hidden="true" />
          <li><span className="dot">3</span> Unit confirmed</li>
        </ol>
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <form onSubmit={submitReservation}>
            <Card>
              <h3 style={{ marginBottom: 16 }}>Reservation details</h3>
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
                  {facilities.data.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
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
                  label="Start date"
                  type="date"
                  required
                  min={todayIso()}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <h3 style={{ margin: '28px 0 16px' }}>Deposit payment option</h3>
              <div className="form-grid">
                <div className="span-2">
                  <Select
                    label="When would you like to pay the deposit?"
                    value={payDepositNow ? 'NOW' : 'LATER'}
                    onChange={(e) => setPayDepositNow(e.target.value === 'NOW')}
                  >
                    <option value="NOW">Pay deposit now ({money(deposit)})</option>
                    <option value="LATER">Book reservation first, pay deposit after unit confirmation</option>
                  </Select>
                </div>

                {payDepositNow && (
                  <>
                    <div className="span-2">
                      <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m} value={m}>{label(m)}</option>
                        ))}
                      </Select>
                    </div>
                    {method === 'CARD' && (
                      <>
                        <div className="span-2">
                          <Input
                            label="Card number"
                            required
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="1234 5678 9012 3456"
                            value={card.number}
                            onChange={setC('number')}
                          />
                        </div>
                        <div className="span-2">
                          <Input
                            label="Name on card"
                            required
                            autoComplete="off"
                            value={card.name}
                            onChange={setC('name')}
                          />
                        </div>
                        <Input
                          label="Expiry"
                          required
                          placeholder="MM/YY"
                          autoComplete="off"
                          value={card.expiry}
                          onChange={setC('expiry')}
                        />
                        <Input
                          label="CVC"
                          required
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          autoComplete="off"
                          value={card.cvc}
                          onChange={setC('cvc')}
                        />
                      </>
                    )}
                    {method === 'BANK_TRANSFER' && (
                      <p className="span-2 muted">
                        Your deposit transfer will be recorded immediately for this reservation.
                      </p>
                    )}
                  </>
                )}
              </div>

              {error2 && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error2}</div>}
              {!canSubmit && (
                <div className="form-alert" role="alert" style={{ marginTop: 16 }}>
                  {facility && !canBook(facility)
                    ? 'This facility is not open for booking right now.'
                    : 'No units of this type are currently available at this facility.'}{' '}
                  <Link to="/storage-options" style={{ textDecoration: 'underline' }}>Choose another unit type</Link>
                </div>
              )}

              <Button type="submit" size="lg" loading={paying} disabled={!canSubmit} style={{ marginTop: 24, width: '100%' }}>
                {payDepositNow ? <><Lock size={18} /> Reserve & Pay Deposit ({money(deposit)})</> : <><CalendarCheck size={18} /> Submit Reservation</>}
              </Button>
            </Card>
          </form>

          {unitType && facility && (
            <Card className="loc-card summary-sticky">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>{unitType.typeName}</h3>
                <Badge tone={units.length ? 'green' : 'neutral'}>
                  {units.length ? `${units.length} available` : 'Fully booked'}
                </Badge>
              </div>
              <div className="meta"><MapPin size={18} /><span>{facility.name} · {facility.address}</span></div>
              {(unitType.sizeDescription || dims) && (
                <div className="meta"><Ruler size={18} /><span>{unitType.sizeDescription || `${dims} m`}</span></div>
              )}
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Estimated rent ({months} × {money(monthly)})</span>
                <span>{money(rentEstimate)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Required deposit</span>
                <strong>{money(deposit)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 18 }}>
                <span>Due now</span>
                <span>{payDepositNow ? money(deposit) : money(0)}</span>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Flow: Create Reservation → Manager assigns unit & confirms → Pay Deposit → Rental Contract (PENDING) → Schedule Check-in.
              </p>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}

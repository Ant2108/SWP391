import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, MapPin, Ruler, CreditCard, Landmark, ShieldCheck, Check, CalendarDays } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { mock } from '../api/mock.js'
import { canBook } from '../utils/facility.js'
import { money, label, fmtDate } from '../utils/format.js'

const METHODS = ['CARD', 'BANK_TRANSFER']
const MONTHS = [1, 3, 6, 12]
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Quy đổi price rule về số tiền: RENTAL -> mỗi tháng, DEPOSIT -> một lần. */
function amountOf(rule, monthly) {
  if (!rule) return null
  if (rule.calculationType === 'PERCENTAGE') return monthly != null ? Math.round((monthly * Number(rule.percentage)) / 100) : null
  if (rule.calculationType === 'PER_DAY') return Number(rule.amount) * 30
  return Number(rule.amount)
}

export default function Checkout() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const facilityId = Number(params.get('facility'))
  const unitTypeId = Number(params.get('unitType'))

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
    const monthly = amountOf(rent, null)
    return { facility, unitType, units, monthly, deposit: amountOf(dep, monthly) ?? 0 }
  }, [facilityId, unitTypeId])

  const [months, setMonths] = useState(1)
  const [startDate, setStartDate] = useState(todayIso())
  const [method, setMethod] = useState('CARD')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' })
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)
  const setC = (k) => (e) => setCard({ ...card, [k]: e.target.value })

  const back = <Link to={facilityId ? `/storage-options?facility=${facilityId}` : '/storage-options'}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to storage options</Link>

  if (loading) return <section className="section"><div className="container"><LoadingState /></div></section>
  if (error) return <section className="section"><div className="container"><ErrorState error={error} onRetry={reload} /></div></section>
  if (!data?.unitType) return <section className="section"><div className="container"><EmptyState title="Unit type not found" message="Pick a unit from the storage options page." action={<Button as={Link} to="/storage-options">Storage options</Button>} /></div></section>

  const { facility, unitType, units, monthly, deposit } = data
  const total = (monthly ?? 0) * months + deposit
  const canPay = monthly != null && units.length > 0 && canBook(facility)
  const endDate = (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10) })()
  const dims = [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ')

  const pay = async (e) => {
    e.preventDefault()
    setError2('')
    if (method === 'CARD' && card.number.replace(/\s/g, '').length < 12) { setError2('Please enter a valid card number.'); return }
    setPaying(true)
    try {
      await new Promise((r) => setTimeout(r, 900)) // giả lập cổng thanh toán
      const { reservation } = await mock.checkout({
        facility, unitType, unitCode: units[0].unitCode, months, startDate, method, monthlyPrice: monthly, deposit,
      })
      toast('Payment successful. Your unit is booked.')
      navigate(`/account/reservations/${reservation.id}`, { replace: true })
    } catch (err) {
      setError2(err.message || 'Payment failed')
      setPaying(false)
    }
  }

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow={back} title="Payment" subtitle="Review your booking and pay to reserve your unit." />
        <ol className="stepper" aria-label="Booking steps">
          <li className="done"><span className="dot"><Check size={16} /></span> Choose a unit</li>
          <span className="bar" aria-hidden="true" />
          <li className="current" aria-current="step"><span className="dot">2</span> Review and pay</li>
          <span className="bar" aria-hidden="true" />
          <li><span className="dot">3</span> Booking confirmed</li>
        </ol>
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <form onSubmit={pay}>
            <Card>
              <h3 style={{ marginBottom: 16 }}>Rental details</h3>
              <div className="form-grid">
                <Select label="Duration" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {MONTHS.map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </Select>
                <Input label="Start date" type="date" required min={todayIso()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <h3 style={{ margin: '28px 0 16px' }}>Payment method</h3>
              <div className="form-grid">
                <div className="span-2 pay-methods" role="group" aria-label="Payment method">
                  {METHODS.map((m) => (
                    <button type="button" key={m} className="pay-method" aria-pressed={method === m} onClick={() => setMethod(m)}>
                      {m === 'CARD' ? <CreditCard size={22} /> : <Landmark size={22} />}
                      <span>{label(m)}<small>{m === 'CARD' ? 'Credit or debit card' : 'Pay by bank transfer'}</small></span>
                    </button>
                  ))}
                </div>
                {method === 'CARD' && <>
                  <div className="span-2"><Input label="Card number" required inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012 3456" value={card.number} onChange={setC('number')} /></div>
                  <div className="span-2"><Input label="Name on card" required autoComplete="off" value={card.name} onChange={setC('name')} /></div>
                  <Input label="Expiry" required placeholder="MM/YY" autoComplete="off" value={card.expiry} onChange={setC('expiry')} />
                  <Input label="CVC" required type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={card.cvc} onChange={setC('cvc')} />
                </>}
                {method === 'BANK_TRANSFER' && <p className="span-2 muted">Transfer details will be shown on your reservation. This is a demo, so no real payment is made.</p>}
              </div>
              {error2 && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error2}</div>}
              {!canPay && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>
                {!canBook(facility) ? 'This facility is not open for booking right now.' : units.length === 0 ? 'No units of this type are available right now.' : 'No rental price is configured for this unit yet.'}{' '}
                <Link to={`/contact`} style={{ textDecoration: 'underline' }}>Contact staff</Link>
              </div>}
              <Button type="submit" size="lg" loading={paying} disabled={!canPay} style={{ marginTop: 24, width: '100%' }}>
                <Lock size={18} /> Pay {money(total)}
              </Button>
              <div className="trust-row">
                <span><ShieldCheck size={16} /> Reserved as soon as payment completes</span>
                <span><Check size={16} /> Deposit shown before you pay</span>
              </div>
              <p className="muted small" style={{ marginTop: 12 }}>Demo checkout: no real payment is processed and card details are never stored.</p>
            </Card>
          </form>

          <Card className="loc-card summary-sticky">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h3>{unitType.typeName}</h3><Badge tone={units.length ? 'green' : 'neutral'}>{units.length ? `${units.length} available` : 'Fully booked'}</Badge>
            </div>
            <div><Badge tone={unitType.storageCategory === 'COLD' ? 'blue' : 'neutral'}>{unitType.storageCategory === 'COLD' ? 'Cold storage' : 'Standard'}</Badge></div>
            <div className="meta"><MapPin size={18} /><span>{facility.name} · {facility.address}</span></div>
            {(unitType.sizeDescription || dims) && <div className="meta"><Ruler size={18} /><span>{unitType.sizeDescription || `${dims} m`}</span></div>}
            {units[0] && <div className="meta"><Check size={18} /><span>Unit <strong style={{ color: 'var(--text)' }}>{units[0].unitCode}</strong> will be assigned to you</span></div>}
            <div className="meta"><CalendarDays size={18} /><span>{fmtDate(startDate)} → {fmtDate(endDate)} ({months} month{months > 1 ? 's' : ''})</span></div>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
            <div className="summary-line"><span>Rent ({months} × {monthly != null ? money(monthly) : '—'})</span><span>{monthly != null ? money(monthly * months) : '—'}</span></div>
            <div className="summary-line"><span>Deposit</span><span>{money(deposit)}</span></div>
            <div className="summary-total"><span>Total</span><span>{money(total)}</span></div>
          </Card>
        </div>
      </div>
    </section>
  )
}

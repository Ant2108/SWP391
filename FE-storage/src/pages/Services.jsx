import { Link } from 'react-router-dom'
import { Check, Search, CreditCard, KeyRound } from 'lucide-react'
import { PageHeader, Card, Badge, Button } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'
import { pickRule } from '../utils/pricing.js'
import { SERVICES } from '../data/services.js'

const STEPS = [
  { icon: Search, title: 'Choose a unit', text: 'Pick a facility and a unit size that fits your goods.' },
  { icon: CreditCard, title: 'Pay to book', text: 'Your unit is reserved as soon as your payment is completed.' },
  { icon: KeyRound, title: 'Move in', text: 'Manage your rentals, payments and appointments in My account.' },
]

/** Giá thuê thấp nhất và tổng số ô còn trống. Lỗi (vd chưa đăng nhập) thì không hiện phần số liệu. */
function useServiceStats() {
  return useAsync(async () => {
    const [facilities, rules, units] = await Promise.all([
      api.facilities.list('ACTIVE'),
      api.priceRules.list(),
      api.storageUnits.search({ status: 'AVAILABLE' }),
    ])
    const typeLists = await Promise.all(facilities.map((f) => api.unitTypes.listByFacility(f.id)))
    let from = null
    facilities.forEach((f, i) => typeLists[i].filter((t) => t.active).forEach((t) => {
      const rule = pickRule(rules, 'RENTAL', f.id, t.id)
      if (rule && rule.calculationType !== 'PERCENTAGE' && (from == null || Number(rule.amount) < from)) from = Number(rule.amount)
    }))
    return { from, available: units.length }
  })
}

export default function Services() {
  const s = useServiceStats().data

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Services" title="Storage for every need"
          subtitle="Secure, flexible storage units for everyday items and business inventory." />

        <div className="grid grid-2">
          {SERVICES.map(({ category, icon: Icon, title, text, suitable, features, terms, adviceSubject }) => (
            <Card hover key={category} className="loc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div className="icon-tile"><Icon size={26} /></div>
                {s && <Badge tone={s.available ? 'green' : 'neutral'}>{s.available ? `${s.available} units available` : 'Fully booked'}</Badge>}
              </div>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
              {s?.from != null && <div style={{ fontSize: 22, fontWeight: 600 }}>From {money(s.from)} <span className="muted small" style={{ fontWeight: 400 }}>/ month</span></div>}

              <div><div className="field-label" style={{ marginBottom: 4 }}>Best for</div><p className="muted">{suitable}</p></div>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>What is included</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {features.map((p) => <li key={p} className="meta"><Check size={18} /><span>{p}</span></li>)}
                </ul>
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Rental terms</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  {terms.map((p) => <li key={p} className="meta"><Check size={18} /><span>{p}</span></li>)}
                </ul>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <Button as={Link} to="/pricing">View pricing</Button>
                <Button as={Link} to={`/account/support?new=1&subject=${encodeURIComponent(adviceSubject)}`} variant="secondary">Contact for advice</Button>
              </div>
            </Card>
          ))}
        </div>

        <h2 style={{ fontSize: 32, margin: '64px 0 24px' }}>How it works</h2>
        <div className="grid grid-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <Card key={title}>
              <div className="icon-tile"><Icon size={26} /></div>
              <h3>{i + 1}. {title}</h3>
              <p className="muted" style={{ marginTop: 8 }}>{text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

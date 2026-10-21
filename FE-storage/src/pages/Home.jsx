import { Link } from 'react-router-dom'
import {
  ShieldCheck, Clock, Maximize2, KeyRound, MapPin, Phone, ArrowRight, Check, Search, CreditCard, PackageCheck,
  Warehouse, Snowflake, Building2, Boxes,
} from 'lucide-react'
import { Button, Card, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import QuickSearch from '../components/QuickSearch.jsx'
import Faq from '../components/Faq.jsx'
import { FAQ } from '../data/faq.js'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { stockOf } from '../utils/facility.js'

const FEATURES = [
  { icon: ShieldCheck, title: '24/7 Security', text: 'Round-the-clock monitoring and controlled access keep your belongings protected.' },
  { icon: Clock, title: 'Flexible Access', text: 'Visit your unit whenever you need to, and book appointments for viewings, move-ins and move-outs.' },
  { icon: Maximize2, title: 'Every Size', text: 'From a small locker to a full warehouse bay, pick the space that fits.' },
  { icon: KeyRound, title: 'Simple Pricing', text: 'Clear rental, deposit and renewal rules with no hidden surprises.' },
]

const STEPS = [
  { icon: Search, title: 'Find your unit', text: 'Search by location, size and type, or browse every available unit.' },
  { icon: CreditCard, title: 'Pay to book', text: 'Review the price and deposit, then pay online. Your unit is reserved right away.' },
  { icon: PackageCheck, title: 'Move in', text: 'Manage rentals, payments and appointments from your account.' },
]

const SERVICES = [
  { category: 'STANDARD', icon: Warehouse, title: 'Standard storage', text: 'Dry, secure units for furniture, documents, equipment and business stock.' },
  { category: 'COLD', icon: Snowflake, title: 'Cold storage', text: 'Temperature-controlled units for food, medicine and other goods that must stay cool.' },
]

/** Số liệu thật lấy từ hệ thống: cơ sở đang hoạt động, ô còn trống (tổng, theo cơ sở, theo loại dịch vụ). */
function useHomeData() {
  return useAsync(async () => {
    const [facilities, units] = await Promise.all([api.facilities.list('ACTIVE'), api.storageUnits.search({ status: 'AVAILABLE' })])
    const active = new Set(facilities.map((f) => f.id))
    const open = units.filter((u) => active.has(u.facilityId))
    const byFacility = open.reduce((m, u) => ({ ...m, [u.facilityId]: (m[u.facilityId] || 0) + 1 }), {})
    const byCategory = open.reduce((m, u) => ({ ...m, [u.storageCategory]: (m[u.storageCategory] || 0) + 1 }), {})
    const types = new Set(open.map((u) => `${u.facilityId}:${u.unitTypeId}`)).size
    return { facilities, available: open.length, byFacility, byCategory, types }
  })
}

export default function Home() {
  const { data, loading, error, reload } = useHomeData()

  const stats = [
    { icon: Building2, value: data?.facilities.length, label: 'Facilities' },
    { icon: Boxes, value: data?.available, label: 'Units available now' },
    { icon: Maximize2, value: data?.types, label: 'Unit types to choose from' },
    { icon: Snowflake, value: data?.byCategory?.COLD ?? 0, label: 'Cold storage units free' },
  ]

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <div className="eyebrow">Self-storage for homes and businesses</div>
            <h1>Secure Storage Solutions You Can Trust</h1>
            <p className="hero-desc">
              From small personal items to large business inventory, we provide safe, accessible storage with 24/7 security monitoring.
            </p>
            <ul className="hero-points">
              <li><Check size={18} /> Book and pay online</li>
              <li><Check size={18} /> Standard and cold storage</li>
              <li><Check size={18} /> Monthly rental, clear deposit</li>
            </ul>
            <div className="hero-actions">
              <Button as={Link} to="/storage-options" size="lg">Find a Storage Unit</Button>
              <Button as={Link} to="/pricing" variant="secondary" size="lg">See Pricing</Button>
            </div>
          </div>
          <div className="hero-media">
            <img src="/hero-units.svg" alt="Row of numbered yellow storage unit doors" />
          </div>
        </div>
        <div className="container"><QuickSearch facilities={data?.facilities || []} /></div>
      </section>

      <section className="stats-strip" aria-label="Live availability">
        <div className="container stats-grid">
          {stats.map(({ icon: Icon, value, label }) => (
            <div className="stat-item" key={label}>
              <span className="stat-icon"><Icon size={22} /></span>
              <div>
                <div className="stat-value">{value == null ? '—' : value}</div>
                <div className="stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Our services</div>
            <h2>The right space for what you store</h2>
          </div>
          <div className="grid grid-2">
            {SERVICES.map(({ category, icon: Icon, title, text }) => {
              const free = data?.byCategory?.[category]
              return (
                <Card hover key={category} className="service-card">
                  <div className="icon-tile"><Icon size={26} /></div>
                  <div className="service-head">
                    <h3>{title}</h3>
                    {free != null && <Badge tone={free ? 'green' : 'neutral'}>{free ? `${free} units available` : 'Fully booked'}</Badge>}
                  </div>
                  <p className="muted">{text}</p>
                  <div className="service-actions">
                    <Button as={Link} to={`/storage-options?type=${category}`} size="sm">Browse {category === 'COLD' ? 'cold' : 'standard'} units</Button>
                    <Button as={Link} to={`/pricing?category=${category}`} variant="secondary" size="sm">View pricing</Button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section band">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>Book your unit in three steps</h2>
          </div>
          <div className="steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div className="step" key={title}>
                <span className="step-num">{i + 1}</span>
                <div className="icon-tile"><Icon size={26} /></div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">Why SafeSpace</div>
            <h2>Storage made simple and safe</h2>
          </div>
          <div className="grid grid-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <Card hover key={title}>
                <div className="icon-tile"><Icon size={26} /></div>
                <h3>{title}</h3>
                <p className="muted" style={{ marginTop: 8 }}>{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="page-header">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <div className="eyebrow">Locations</div>
              <h2>Find a facility near you</h2>
            </div>
            <Button as={Link} to="/locations" variant="secondary">All locations <ArrowRight size={18} /></Button>
          </div>
          {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
            !data.facilities.length ? <EmptyState title="No locations available" message="Please check back soon." /> : (
              <div className="grid grid-3">
                {data.facilities.slice(0, 3).map((f) => <FacilityCard key={f.id} f={f} available={data.byFacility[f.id] || 0} />)}
              </div>
            )}
        </div>
      </section>

      <section className="section band">
        <div className="container faq-layout">
          <div>
            <div className="eyebrow">FAQ</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,40px)' }}>Questions, answered</h2>
            <p className="muted" style={{ marginTop: 12 }}>Can't find what you need? Our staff are happy to help.</p>
            <Button as={Link} to="/account/support?new=1" variant="secondary" style={{ marginTop: 20 }}>Contact staff</Button>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2 style={{ fontSize: 'clamp(28px,3vw,40px)' }}>Ready to store with confidence?</h2>
              <p>Find the right unit now, or tell us what you need and our staff will help.</p>
            </div>
            <div className="cta-actions">
              <Button as={Link} to="/storage-options" size="lg">Find a unit</Button>
              <Button as={Link} to="/contact" variant="secondary" size="lg">Contact us</Button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function FacilityCard({ f, available }) {
  return (
    <Card hover className="loc-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h3>{f.name}</h3>
        {f.stockStatus && f.stockStatus !== 'AVAILABLE'
          ? <Badge tone={stockOf(f).tone}>{stockOf(f).label}</Badge>
          : available != null && <Badge tone={available ? 'green' : 'neutral'}>{available ? `${available} units available` : 'Fully booked'}</Badge>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(f.storageTypes || ['STANDARD']).map((t) => <Badge key={t} tone={t === 'COLD' ? 'blue' : 'neutral'}>{t === 'COLD' ? 'Cold storage' : 'Standard'}</Badge>)}
      </div>
      <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
      {f.phone && <div className="meta"><Phone size={18} /><span>{f.phone}</span></div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button as={Link} to={`/locations/${f.id}`} size="sm">Details</Button>
        <Button as={Link} to={`/storage-options?facility=${f.id}`} variant="secondary" size="sm">Browse units</Button>
      </div>
    </Card>
  )
}

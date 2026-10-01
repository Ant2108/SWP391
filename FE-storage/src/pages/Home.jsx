import { Link } from 'react-router-dom'
import { ShieldCheck, Clock, Maximize2, KeyRound, MapPin, Phone, ArrowRight } from 'lucide-react'
import { Button, Card, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

const FEATURES = [
  { icon: ShieldCheck, title: '24/7 Security', text: 'Round-the-clock monitoring and controlled access keep your belongings protected.' },
  { icon: Clock, title: 'Flexible Access', text: 'Reach your unit when it suits you, with extended opening hours at every location.' },
  { icon: Maximize2, title: 'Every Size', text: 'From a small locker to a full warehouse bay, pick the space that fits.' },
  { icon: KeyRound, title: 'Simple Pricing', text: 'Clear rental, deposit and renewal rules with no hidden surprises.' },
]

export default function Home() {
  const { data, loading, error, reload } = useAsync(() => api.facilities.list('ACTIVE'))

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <h1>Secure Storage Solutions You Can Trust</h1>
            <p className="hero-desc">
              From small personal items to large business inventory, we provide safe, accessible storage with 24/7 security monitoring.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/storage-options" size="lg">Find a Storage Unit</Button>
              <Button as={Link} to="/locations" variant="secondary" size="lg">View Locations</Button>
            </div>
          </div>
          <div className="hero-media">
            <img src="/hero-units.svg" alt="Row of numbered yellow storage unit doors" />
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
            !data.length ? <EmptyState title="No locations available" message="Please check back soon." /> : (
              <div className="grid grid-3">
                {data.slice(0, 3).map((f) => <FacilityCard key={f.id} f={f} />)}
              </div>
            )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <div>
              <h2 style={{ fontSize: 'clamp(28px,3vw,40px)' }}>Ready to store with confidence?</h2>
              <p>Tell us what you need and we will help you find the right unit.</p>
            </div>
            <Button as={Link} to="/contact" size="lg">Get a Quote</Button>
          </div>
        </div>
      </section>
    </>
  )
}

export function FacilityCard({ f }) {
  const t = (v) => (v ? v.slice(0, 5) : null)
  return (
    <Card hover className="loc-card">
      <h3>{f.name}</h3>
      <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
      {f.phone && <div className="meta"><Phone size={18} /><span>{f.phone}</span></div>}
      {(f.openingTime || f.closingTime) && (
        <div className="meta"><Clock size={18} /><span>{t(f.openingTime) || '—'} – {t(f.closingTime) || '—'}</span></div>
      )}
      <Button as={Link} to={`/storage-options?facility=${f.id}`} variant="secondary" size="sm" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
        View units
      </Button>
    </Card>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, Building2, Boxes, ShieldCheck, Headset, CreditCard, MapPinned } from 'lucide-react'
import { PageHeader, Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import LocationCard from '../components/LocationCard.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { monthlyRate, pickRule } from '../utils/pricing.js'

const FILTERS = [
  { value: '', label: 'All locations' },
  { value: 'AVAILABLE', label: 'Units available now' },
]

const PERKS = [
  { icon: ShieldCheck, title: '24/7 security monitoring', text: 'Every facility is monitored around the clock.' },
  { icon: CreditCard, title: 'Book and pay online', text: 'Choose a unit, pay securely and it is reserved at once.' },
  { icon: Headset, title: 'Help from our staff', text: 'Ask about sizes, prices or visits through the Support page.' },
  { icon: MapPinned, title: 'Easy to find', text: 'Get directions to any facility with one click.' },
]

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

/** Mọi dữ liệu của trang: cơ sở đang hoạt động + loại kho + ô trống + (nếu đọc được) giá thuê. */
function useLocations() {
  return useAsync(async () => {
    const facilities = await api.facilities.list('ACTIVE')
    const [units, typeLists, rules] = await Promise.all([
      api.storageUnits.search({ status: 'AVAILABLE' }),
      Promise.all(facilities.map((f) => api.unitTypes.listByFacility(f.id))),
      api.priceRules.list().catch(() => []), // bảng giá là thông tin công khai (khách chưa đăng nhập cũng đọc được); nếu gọi lỗi thì bỏ qua phần "From …"
    ])
    const items = facilities.map((f, i) => {
      const mine = units.filter((u) => u.facilityId === f.id)
      const types = typeLists[i].filter((t) => t.active).map((t) => ({
        id: t.id, typeName: t.typeName, free: mine.filter((u) => u.unitTypeId === t.id).length,
        price: monthlyRate(pickRule(rules, 'RENTAL', f.id, t.id)),
      }))
      const prices = types.map((t) => t.price).filter((p) => p != null)
      return { f, free: mine.length, types, fromPrice: prices.length ? Math.min(...prices) : null }
    })
    return { items, totalFree: units.length }
  })
}

export default function Locations() {
  const { data, loading, error, reload } = useLocations()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')

  const shown = (data?.items || []).filter(({ f, free }) => {
    if (filter === 'AVAILABLE' && !(free > 0 && (f.stockStatus || 'AVAILABLE') === 'AVAILABLE')) return false
    const n = norm(q).trim()
    return !n || norm(`${f.name} ${f.address}`).includes(n)
  })

  const stats = [
    { icon: Building2, value: data?.items.length, label: 'Facilities' },
    { icon: Boxes, value: data?.totalFree, label: 'Units available now' },
  ]

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Locations" title="Our storage facilities"
          subtitle="Choose a facility close to home or work, compare unit types and see what is available right now." />

        <div className="loc-stats">
          {stats.map(({ icon: Icon, value, label }) => (
            <div className="stat-item" key={label}>
              <span className="stat-icon"><Icon size={22} /></span>
              <div><div className="stat-value">{value == null ? '—' : value}</div><div className="stat-label">{label}</div></div>
            </div>
          ))}
        </div>

        <div className="ufilter" style={{ marginTop: 28 }}>
          <div className="ufilter-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by facility name, district or street…" aria-label="Search locations" />
            {q && <button type="button" className="ufilter-clear" onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
          </div>
          <div className="segmented" role="group" aria-label="Filter locations">
            {FILTERS.map((o) => (
              <button key={o.value} type="button" className={`seg ${filter === o.value ? 'active' : ''}`} aria-pressed={filter === o.value} onClick={() => setFilter(o.value)}>{o.label}</button>
            ))}
          </div>
        </div>

        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
          !data.items.length ? <EmptyState title="No locations available" message="Please check back soon." /> :
          !shown.length ? (
            <div className="no-match" role="status">
              <h3>No location matches your search</h3>
              <p className="muted">Try a different name or area, or contact our staff and they will help you find a suitable facility.</p>
              <div className="no-match-actions">
                <Button as={Link} to="/account/support?new=1&subject=Looking%20for%20a%20facility"><Headset size={18} /> Contact staff</Button>
                <Button variant="secondary" onClick={() => { setQ(''); setFilter('') }}>Clear filters</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ margin: '4px 0 18px' }} aria-live="polite">{shown.length} of {data.items.length} locations</p>
              <div className="grid grid-3">
                {shown.map(({ f, free, types, fromPrice }) => <LocationCard key={f.id} f={f} free={free} types={types} fromPrice={fromPrice} />)}
              </div>
            </>
          )}

        <div className="perks">
          <div className="section-head" style={{ marginBottom: 28 }}>
            <div className="eyebrow">At every location</div>
            <h2 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>What you can expect</h2>
          </div>
          <div className="grid grid-4">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <div className="perk" key={title}>
                <div className="icon-tile"><Icon size={24} /></div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="cta-band" style={{ marginTop: 64 }}>
          <div>
            <h2 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Not sure which location suits you?</h2>
            <p>Tell us what you plan to store and our staff will recommend a facility and unit size.</p>
          </div>
          <div className="cta-actions">
            <Button as={Link} to="/storage-options" size="lg">Browse all units</Button>
            <Button as={Link} to="/account/support?new=1" variant="secondary" size="lg">Contact staff</Button>
          </div>
        </div>
      </div>
    </section>
  )
}

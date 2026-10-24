import { Link, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { label, money } from '../utils/format.js'
import { priceText, inPeriod, pickRule, dailyRate, monthlyRate } from '../utils/pricing.js'
import { SERVICES } from '../data/services.js'

const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return t.sizeDescription || (d.length ? `${d.join(' × ')} m` : '—')
}

/** Bảng giá dịch vụ theo ngày: mỗi dịch vụ (kho thường / kho lạnh) kèm thông tin dịch vụ và giá từng loại kho. */
export default function Pricing() {
  const [params, setParams] = useSearchParams()
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const selected = Number(params.get('facility')) || facilities.data?.[0]?.id
  const setParam = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p) }

  const data = useAsync(async () => {
    if (!selected) return null
    const [types, rules, units] = await Promise.all([
      api.unitTypes.listByFacility(selected),
      api.priceRules.list(),
      api.storageUnits.search({ facilityId: selected, status: 'AVAILABLE' }),
    ])
    return { types: types.filter((t) => t.active), rules, units }
  }, [selected])

  const columnsFor = (rules, units) => [
    { key: 'type', header: 'Unit type', render: (t) => <><div className="cell-title">{t.typeName}</div><div className="cell-sub">{dims(t)}</div></> },
    { key: 'day', header: 'Price / day', render: (t) => {
      const d = dailyRate(pickRule(rules, 'RENTAL', selected, t.id))
      return d ? <><strong>{d.exact ? '' : '≈ '}{money(d.amount)}</strong><div className="cell-sub">per day</div></> : '—'
    } },
    { key: 'month', header: 'Price / month', render: (t) => {
      const m = monthlyRate(pickRule(rules, 'RENTAL', selected, t.id))
      return m != null ? money(m) : '—'
    } },
    { key: 'deposit', header: 'Deposit', render: (t) => priceText(pickRule(rules, 'DEPOSIT', selected, t.id)) },
    { key: 'avail', header: 'Availability', render: (t) => {
      const n = units.filter((u) => u.unitTypeId === t.id).length
      return <Badge tone={n ? 'green' : 'neutral'}>{n ? `${n} available` : 'Booked'}</Badge>
    } },
    { key: 'actions', header: '', className: 'actions', render: (t) => (
      <Button as={Link} to={`/locations/${selected}/unit-types/${t.id}`} size="sm" variant="secondary">Detail</Button>) },
  ]

  // Phụ phí / giảm giá đang áp dụng cho cơ sở này (không gắn với một loại kho cụ thể).
  const extras = (data.data?.rules || []).filter((r) => !['RENTAL', 'DEPOSIT'].includes(r.priceType)
    && inPeriod(r) && r.unitTypeId == null && (r.facilityId == null || r.facilityId === selected))

  const shown = SERVICES

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Pricing" title="Service price list"
          subtitle="Daily rental prices for every unit type, and what the service includes. Prices are in Vietnamese dong (₫)." />
        {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
          !facilities.data.length ? <EmptyState title="No locations available" /> : (
            <>
              <div className="tabs" role="tablist" aria-label="Facility">
                {facilities.data.map((f) => (
                  <button key={f.id} role="tab" aria-selected={f.id === selected}
                    className={`chip ${f.id === selected ? 'active' : ''}`} onClick={() => setParam('facility', f.id)}>{f.name}</button>
                ))}
              </div>

              {data.loading ? <LoadingState /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : (
                <>
                  {shown.map(({ category: cat, icon: Icon, title, text, suitable, features, terms }) => {
                    const types = data.data?.types || []
                    return (
                      <Card key={cat} style={{ marginBottom: 32 }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
                          <div className="icon-tile" style={{ margin: 0 }}><Icon size={26} /></div>
                          <div><h3>{title}</h3><p className="muted">{text}</p></div>
                        </div>

                        <div className="grid grid-3" style={{ marginBottom: 24, gap: 24 }}>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Included services</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                              {features.map((p) => <li key={p} className="loc-card"><span className="meta"><Check size={18} /><span>{p}</span></span></li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Rental terms</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                              {terms.map((p) => <li key={p} className="loc-card"><span className="meta"><Check size={18} /><span>{p}</span></span></li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Best for</div>
                            <p className="muted">{suitable}</p>
                          </div>
                        </div>

                        <DataTable columns={columnsFor(data.data.rules, data.data.units)} rows={types} rowKey="id"
                          empty={<EmptyState title={`No ${title.toLowerCase()} units here`} message="This facility does not offer this service yet. Try another facility or contact our staff."
                            action={<Button as={Link} to={`/account/support?new=1&facility=${selected}&subject=${encodeURIComponent(`Advice about ${title.toLowerCase()}`)}`} variant="secondary">Contact for advice</Button>} />} />
                      </Card>
                    )
                  })}

                  {extras.length > 0 && (
                    <Card style={{ marginTop: 8 }}>
                      <h3 style={{ marginBottom: 12 }}>Other charges and discounts</h3>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {extras.map((r) => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span>{label(r.priceType)}</span><strong>{priceText(r)}</strong>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  <p className="muted small" style={{ marginTop: 24 }}>
                    Daily prices marked ≈ are the monthly price divided by 30. Booking is currently by the month and is confirmed once payment is completed.
                  </p>
                </>
              )}
            </>
          )}
      </div>
    </section>
  )
}

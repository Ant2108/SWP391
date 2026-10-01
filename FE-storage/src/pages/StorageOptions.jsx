import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ruler } from 'lucide-react'
import { PageHeader, Card, Badge, Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

const dims = (u) => {
  const d = [u.width, u.length, u.height].filter((v) => v != null)
  return d.length ? d.join(' × ') + ' m' : null
}

export default function StorageOptions() {
  const [params, setParams] = useSearchParams()
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const selected = Number(params.get('facility')) || facilities.data?.[0]?.id

  const options = useAsync(async () => {
    if (!selected) return []
    const [types, units] = await Promise.all([
      api.unitTypes.listByFacility(selected),
      api.storageUnits.search({ facilityId: selected, status: 'AVAILABLE' }),
    ])
    return types.filter((t) => t.active).map((t) => ({
      ...t, available: units.filter((u) => u.unitTypeId === t.id).length,
    }))
  }, [selected])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [])

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Storage Options" title="Find the right unit" subtitle="Browse unit sizes at each facility and see what is available right now." />
        {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
          !facilities.data.length ? <EmptyState title="No locations available" /> : (
            <>
              <div className="tabs" role="tablist">
                {facilities.data.map((f) => (
                  <button key={f.id} role="tab" aria-selected={f.id === selected}
                    className={`chip ${f.id === selected ? 'active' : ''}`}
                    onClick={() => setParams({ facility: f.id })}>{f.name}</button>
                ))}
              </div>
              {options.loading ? <LoadingState /> : options.error ? <ErrorState error={options.error} onRetry={options.reload} /> :
                !options.data.length ? <EmptyState title="No unit types yet" message="This facility has not published any unit sizes." /> : (
                  <div className="grid grid-3">
                    {options.data.map((t) => (
                      <Card hover key={t.id} className="loc-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                          <h3>{t.typeName}</h3>
                          <Badge tone={t.available ? 'green' : 'neutral'}>{t.available ? `${t.available} available` : 'Fully booked'}</Badge>
                        </div>
                        {(t.sizeDescription || dims(t)) && <div className="meta"><Ruler size={18} /><span>{t.sizeDescription || dims(t)}</span></div>}
                        {t.description && <p className="muted">{t.description}</p>}
                        <Button as={Link} to="/contact" variant={t.available ? 'primary' : 'secondary'} size="sm" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                          Request a quote
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
            </>
          )}
      </div>
    </section>
  )
}

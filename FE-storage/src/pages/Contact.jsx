import { MapPin, Phone, Clock } from 'lucide-react'
import { PageHeader, Card, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

export default function Contact() {
  const { data, loading, error, reload } = useAsync(() => api.facilities.list('ACTIVE'))
  const t = (v) => (v ? v.slice(0, 5) : '—')
  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Contact" title="Get a quote"
          subtitle="Call or visit any of our facilities and our team will help you find the right unit and price." />
        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
          !data.length ? <EmptyState title="No contact details available" /> : (
            <div className="grid grid-3">
              {data.map((f) => (
                <Card key={f.id} className="loc-card">
                  <h3>{f.name}</h3>
                  <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
                  {f.phone && <div className="meta"><Phone size={18} /><a href={`tel:${f.phone}`}>{f.phone}</a></div>}
                  <div className="meta"><Clock size={18} /><span>{t(f.openingTime)} – {t(f.closingTime)}</span></div>
                </Card>
              ))}
            </div>
          )}
      </div>
    </section>
  )
}

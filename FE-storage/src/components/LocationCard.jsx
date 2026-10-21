import { Link } from 'react-router-dom'
import { MapPin, Phone, Navigation, Warehouse, ArrowRight } from 'lucide-react'
import { Badge, Button } from './ui.jsx'
import { stockOf } from '../utils/facility.js'
import { money } from '../utils/format.js'

const mapsUrl = (f) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.name}, ${f.address}`)}`
const initials = (name) => name.replace(/^kho\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/**
 * Thẻ cơ sở trang Locations: tên, loại kho, tình trạng, địa chỉ + chỉ đường, liên hệ,
 * các loại kho đang có (kèm số ô trống) và giá thuê thấp nhất theo tháng nếu biết.
 * `types`: [{ id, typeName, free }]; `fromPrice`: số tiền/tháng hoặc null.
 */
export default function LocationCard({ f, free, types, fromPrice }) {
  const stock = stockOf(f)
  const open = (f.stockStatus || 'AVAILABLE') === 'AVAILABLE'
  return (
    <article className="loc-tile">
      <div className="loc-tile-top">
        <span className="loc-badge" aria-hidden="true">{initials(f.name)}</span>
        <div className="loc-tile-title">
          <h3>{f.name}</h3>
          <div className="loc-tags">
            {open
              ? <Badge tone={free ? 'green' : 'neutral'}>{free == null ? 'Open' : free ? `${free} units available` : 'Fully booked'}</Badge>
              : <Badge tone={stock.tone}>{stock.label}</Badge>}
          </div>
        </div>
      </div>

      <ul className="loc-info">
        <li><MapPin size={17} /><span>{f.address}</span></li>
        {f.phone && <li><Phone size={17} /><a href={`tel:${f.phone}`}>{f.phone}</a></li>}
      </ul>

      {types.length > 0 && (
        <div className="loc-types" aria-label="Unit types">
          <div className="loc-types-head">
            <span className="field-label"><Warehouse size={14} /> Unit types</span>
            {fromPrice != null && <span className="loc-from">From <strong>{money(fromPrice)}</strong> / month</span>}
          </div>
          <div className="loc-chips">
            {types.map((t) => (
              <span key={t.id} className={`loc-chip ${t.free ? '' : 'is-out'}`} title={t.free ? `${t.free} available` : 'Booked'}>
                {t.typeName}<b>{t.free || '–'}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="loc-actions">
        <Button as={Link} to={`/locations/${f.id}`} size="sm">View details <ArrowRight size={16} /></Button>
        <a className="btn btn-secondary btn-sm" href={mapsUrl(f)} target="_blank" rel="noopener noreferrer">
          <Navigation size={16} /> Directions
        </a>
      </div>
    </article>
  )
}

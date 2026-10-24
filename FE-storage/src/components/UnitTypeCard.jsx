import { useNavigate } from 'react-router-dom'
import { Ruler, MapPin, Warehouse, ArrowRight } from 'lucide-react'
import { Badge } from './ui.jsx'
import UnitImage from './UnitImage.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { area } from '../utils/unitFilter.js'

const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return d.length ? d.join(' × ') + ' m' : null
}

/**
 * Thẻ loại kho: ảnh, thông tin và các ô còn trống. Bấm vào thẻ để xem chi tiết;
 * nếu loại kho đã hết ô (đã được book) thì chỉ hiện thông báo, không mở trang chi tiết.
 * `units` là các ô AVAILABLE thuộc loại kho này.
 */
export default function UnitTypeCard({ facilityId, type: t, units }) {
  const navigate = useNavigate()
  const toast = useToast()
  const booked = units.length === 0
  const shown = units.slice(0, 3)
  const a = area(t)

  const open = () => {
    if (booked) { toast(`${t.typeName} has already been booked.`, 'error'); return }
    navigate(`/locations/${facilityId}/unit-types/${t.id}`)
  }

  return (
    <article className={`unit-card ${booked ? 'is-booked' : ''}`} role="link" tabIndex={0} aria-label={`${t.typeName}${booked ? ' (booked)' : ''}`}
      onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}>
      <div className="unit-card-media">
        <UnitImage imageUrl={t.imageUrl} name={t.typeName} width={t.width} length={t.length} height={t.height} booked={booked} style={{ borderRadius: 0 }} />
        <span className="unit-pill"><Warehouse size={14} />Standard</span>
        <span className="unit-status"><Badge tone={booked ? 'neutral' : 'green'}>{booked ? 'Booked' : `${units.length} available`}</Badge></span>
      </div>

      <div className="unit-card-body">
        <h3>{t.typeName}</h3>
        {t.description && <p className="muted unit-desc">{t.description}</p>}

        <div className="unit-specs">
          {(t.sizeDescription || dims(t)) && <span><Ruler size={15} />{t.sizeDescription || dims(t)}</span>}
          {a != null && <span>{Number.isInteger(a) ? a : a.toFixed(1)} m²</span>}
        </div>

        {!booked && (
          <ul className="unit-list" aria-label="Available units">
            {shown.map((u) => (
              <li key={u.id}>
                <MapPin size={14} />
                <strong>{u.unitCode}</strong>
                <span className="muted">{[u.floor && `Floor ${u.floor}`, u.location].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
            {units.length > shown.length && <li className="muted small">+ {units.length - shown.length} more</li>}
          </ul>
        )}

        <div className="unit-card-foot">
          <span>{booked ? 'Not available' : 'View details'}</span>
          {!booked && <ArrowRight size={18} />}
        </div>
      </div>
    </article>
  )
}

import { useNavigate } from 'react-router-dom'
import { Ruler, MapPin } from 'lucide-react'
import { Card, Badge } from './ui.jsx'
import UnitImage from './UnitImage.jsx'
import { useToast } from '../hooks/useToast.jsx'

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

  const open = () => {
    if (booked) { toast(`${t.typeName} has already been booked.`, 'error'); return }
    navigate(`/locations/${facilityId}/unit-types/${t.id}`)
  }

  return (
    <Card hover className="loc-card" role="link" tabIndex={0} aria-label={`${t.typeName}${booked ? ' (booked)' : ''}`}
      onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      style={{ cursor: 'pointer', opacity: booked ? 0.8 : 1 }}>
      <UnitImage imageUrl={t.imageUrl} category={t.storageCategory} name={t.typeName} width={t.width} length={t.length} height={t.height} booked={booked} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h3>{t.typeName}</h3>
        <Badge tone={booked ? 'neutral' : 'green'}>{booked ? 'Booked' : `${units.length} available`}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone={t.storageCategory === 'COLD' ? 'blue' : 'neutral'}>{t.storageCategory === 'COLD' ? 'Cold storage' : 'Standard'}</Badge>
      </div>
      {(t.sizeDescription || dims(t)) && <div className="meta"><Ruler size={18} /><span>{t.sizeDescription || dims(t)}</span></div>}
      {t.description && <p className="muted">{t.description}</p>}
      {!booked && (
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>Available units</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {shown.map((u) => (
              <div key={u.id} className="meta"><MapPin size={18} />
                <span><strong style={{ color: 'var(--text)' }}>{u.unitCode}</strong>{[u.floor && `Floor ${u.floor}`, u.location].filter(Boolean).length ? ` · ${[u.floor && `Floor ${u.floor}`, u.location].filter(Boolean).join(' · ')}` : ''}</span>
              </div>
            ))}
            {units.length > shown.length && <div className="muted small">+ {units.length - shown.length} more</div>}
          </div>
        </div>
      )}
    </Card>
  )
}

import { useNavigate } from 'react-router-dom'
import { Ruler, Maximize2, ArrowRight, ShoppingBag, DoorClosed, Boxes } from 'lucide-react'
import UnitImage from './UnitImage.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { areaText, sizeBucket, prettyType } from '../utils/unitFilter.js'
import { SIZE_LABEL } from '../utils/unitPhotos.js'

const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return d.length ? d.join(' × ') + ' m' : null
}

// Ánh sáng nhẹ chạy theo chuột trên thẻ (chỉ đổi biến CSS).
const followLight = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/** Thẻ một loại kho: ảnh thật, cỡ, kích thước, các ô còn trống, nút xem chi tiết và đặt ngay. */
export default function UnitTypeCard({ facilityId, type: t, units }) {
  const navigate = useNavigate()
  const toast = useToast()
  const booked = units.length === 0
  const shown = units.slice(0, 4)
  const bucket = sizeBucket(t)
  const name = prettyType(t.typeName)

  const open = () => {
    if (booked) { toast(`Loại kho ${name} hiện đã hết ô trống.`, 'error'); return }
    navigate(`/locations/${facilityId}/unit-types/${t.id}`)
  }
  const bookNow = (e) => {
    e.stopPropagation()
    if (booked) { toast(`Loại kho ${name} hiện đã hết ô trống.`, 'error'); return }
    navigate(`/checkout?facility=${facilityId}&unitType=${t.id}`)
  }

  return (
    <article className={`ut-card ${booked ? 'is-booked' : ''}`} role="link" tabIndex={0} aria-label={`${name}${booked ? ' (đã hết kho)' : ''}`}
      onPointerMove={followLight} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}>
      <div className="ut-media">
        <UnitImage imageUrl={t.imageUrl} name={name} width={t.width} length={t.length} booked={booked} style={{ borderRadius: 0, aspectRatio: '16 / 10' }} />
        {bucket && <span className="ut-size">{SIZE_LABEL[bucket]}</span>}
        <span className={`ut-status ${booked ? 'is-out' : ''}`}><i />{booked ? 'Đã hết kho' : `Còn ${units.length} ô`}</span>
      </div>

      <div className="ut-body">
        <h3>{name}</h3>
        {t.description && <p className="muted ut-desc">{t.description}</p>}

        <div className="ut-specs">
          {(t.sizeDescription || dims(t)) && <span><Ruler size={14} />{t.sizeDescription || dims(t)}</span>}
          {areaText(t) && <span><Maximize2 size={14} />{areaText(t)}</span>}
        </div>

        {!booked && (
          <div className="ut-units" aria-label="Ô kho còn trống">
            {shown.map((u) => (
              <span key={u.id} className="ut-unit" title={[u.floor && `Tầng ${u.floor}`, u.location].filter(Boolean).join(' · ')}>
                <DoorClosed size={13} />{u.unitCode}
              </span>
            ))}
            {units.length > shown.length && <span className="ut-unit is-more"><Boxes size={13} />+{units.length - shown.length}</span>}
          </div>
        )}

        <div className="ut-actions">
          <span className="ut-link">{booked ? 'Vui lòng quay lại sau' : 'Xem chi tiết'} {!booked && <ArrowRight size={16} />}</span>
          {!booked && <button type="button" className="btn-pill" onClick={bookNow}><ShoppingBag size={15} /> Đặt ngay</button>}
        </div>
      </div>
    </article>
  )
}

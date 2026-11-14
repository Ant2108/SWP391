import { Link } from 'react-router-dom'
import { MapPin, Phone, Navigation, Warehouse, ArrowRight, Clock, Boxes, Tag, Package } from 'lucide-react'
import { stockOf } from '../utils/facility.js'
import { money, unitTypeLabel } from '../utils/format.js'

const mapsUrl = (f) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.name}, ${f.address}`)}`
const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
// Tên loại kho hiển thị bằng tiếng Việt (SMALL → Nhỏ, MEDIUM → Vừa...).
const prettyType = (s) => unitTypeLabel(s)

// Đang trong giờ mở cửa không (giờ máy người xem). Thiếu giờ thì không đoán.
function openNow(f) {
  const o = hhmm(f.openingTime), c = hhmm(f.closingTime)
  if (!o || !c) return null
  const d = new Date()
  const now = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return o <= c ? now >= o && now < c : now >= o || now < c
}

// Ánh sáng nhẹ chạy theo chuột trên thẻ (chỉ đổi 2 biến CSS, không render lại React).
const followLight = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/**
 * Thẻ cơ sở trang Cơ sở kho: biểu tượng kho, tên, tình trạng; địa chỉ, giờ mở cửa, điện thoại;
 * số ô trống + giá từ; các loại kho (kèm số ô trống); nút xem chi tiết và chỉ đường.
 * `types`: [{ id, typeName, free }]; `fromPrice`: số tiền/tháng hoặc null.
 */
export default function LocationCard({ f, free, types, fromPrice }) {
  const stock = stockOf(f)
  const accepting = (f.stockStatus || 'AVAILABLE') === 'AVAILABLE'
  const isOpen = openNow(f)
  const status = !accepting
    ? { tone: stock.tone, label: stock.label }
    : free
      ? { tone: 'green', label: 'Còn ô trống' }
      : { tone: 'neutral', label: 'Đã hết kho' }

  return (
    <article className="fac-card" onPointerMove={followLight}>
      <header className="fac-head">
        <span className="fac-icon" aria-hidden="true"><Warehouse size={24} strokeWidth={2.1} /></span>
        <div className="fac-title">
          <h3>{f.name}</h3>
          <span className={`fac-status tone-${status.tone}`}><i />{status.label}</span>
        </div>
      </header>

      <ul className="fac-info">
        <li><MapPin size={16} /><span>{f.address}</span></li>
        {hhmm(f.openingTime) && (
          <li>
            <Clock size={16} />
            <span>
              {hhmm(f.openingTime)} – {hhmm(f.closingTime)}
              {isOpen != null && <em className={isOpen ? 'is-open' : 'is-closed'}>{isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}</em>}
            </span>
          </li>
        )}
        {f.phone && <li><Phone size={16} /><a href={`tel:${f.phone}`}>{f.phone}</a></li>}
      </ul>

      <div className="fac-stats">
        <div>
          <span className="fac-stat-icon"><Boxes size={16} /></span>
          <div><strong>{free ?? '—'}</strong><small>Ô trống</small></div>
        </div>
        <div>
          <span className="fac-stat-icon"><Tag size={16} /></span>
          <div><strong>{fromPrice != null ? money(fromPrice) : '—'}</strong><small>Từ / tháng</small></div>
        </div>
      </div>

      {types.length > 0 && (
        <div className="fac-types" aria-label="Các loại kho">
          {types.map((t) => (
            <span key={t.id} className={`fac-chip ${t.free ? '' : 'is-out'}`} title={t.free ? `Còn ${t.free} ô` : 'Đã hết kho'}>
              <Package size={13} />{prettyType(t.typeName)}<b>{t.free || '–'}</b>
            </span>
          ))}
        </div>
      )}

      <div className="fac-actions">
        <Link to={`/locations/${f.id}`} className="btn-pill">Xem chi tiết <ArrowRight size={16} /></Link>
        <a className="btn-pill btn-pill-ghost" href={mapsUrl(f)} target="_blank" rel="noopener noreferrer" data-no-transition>
          <Navigation size={15} /> Chỉ đường
        </a>
      </div>
    </article>
  )
}

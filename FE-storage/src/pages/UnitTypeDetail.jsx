import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ruler, MapPin, AlertCircle, Maximize2, MoveVertical, Clock, ShieldCheck,
  DoorClosed, Layers, ShoppingBag, MessageSquare, ArrowRight, Wallet,
} from 'lucide-react'
import { Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api, assetUrl } from '../api/client.js'
import { priceText, depositText, pickRule } from '../utils/pricing.js'
import { canBook, stockOf } from '../utils/facility.js'
import { areaText, sizeBucket, prettyType } from '../utils/unitFilter.js'
import { unitPhoto, GALLERY_EXTRA, SIZE_LABEL } from '../utils/unitPhotos.js'

const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return d.length ? d.join(' × ') + ' m' : null
}
const hhmm = (s) => (s ? String(s).slice(0, 5) : null)

// Ánh sáng nhẹ chạy theo chuột trên ô kho (chỉ đổi biến CSS).
const followLight = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/** Thư viện ảnh: ảnh lớn + ảnh nhỏ để đổi. Ảnh riêng của loại kho (nếu có) đứng đầu, sau đó là ảnh thật minh họa. */
function Gallery({ type, booked }) {
  const own = type.imageUrl ? [{ src: assetUrl(type.imageUrl), srcSet: undefined, alt: `Ô kho loại ${prettyType(type.typeName)}` }] : []
  const images = [...own, unitPhoto(type), ...GALLERY_EXTRA]
  const [i, setI] = useState(0)
  const main = images[i]
  return (
    <div className="utd-gallery">
      <figure className={`utd-main ${booked ? 'is-booked' : ''}`}>
        <img key={main.src} src={main.src} srcSet={main.srcSet} sizes="(max-width: 900px) 100vw, 55vw" alt={main.alt} />
      </figure>
      <div className="utd-thumbs">
        {images.map((img, n) => (
          <button key={img.src} type="button" className={n === i ? 'is-active' : ''} onClick={() => setI(n)} aria-label={`Xem ảnh ${n + 1}`}>
            <img src={img.src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Chi tiết một loại kho: ảnh thật, thông tin, giá, các ô còn trống (bấm vào để đặt đúng ô đó). */
export default function UnitTypeDetail() {
  const { facilityId, typeId } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [facility, types, units, rules] = await Promise.all([
      api.facilities.get(facilityId),
      api.unitTypes.listByFacility(facilityId),
      api.storageUnits.search({ facilityId, unitTypeId: typeId, status: 'AVAILABLE' }),
      api.priceRules.list().catch(() => []),
    ])
    // Rule cụ thể nhất thắng (loại kho > cơ sở > toàn hệ thống), giống cách backend tính tiền.
    const fid = Number(facilityId), tid = Number(typeId)
    return { facility, type: types.find((t) => String(t.id) === String(typeId)), units,
      rent: pickRule(rules, 'RENTAL', fid, tid), deposit: pickRule(rules, 'DEPOSIT', fid, tid) }
  }, [facilityId, typeId])

  const wrap = (node) => <section className="section"><div className="container">{node}</div></section>
  if (loading) return wrap(<LoadingState />)
  if (error) return wrap(<ErrorState error={error} onRetry={reload} />)
  if (!data.type) return wrap(<EmptyState title="Không tìm thấy loại kho" action={<Button as={Link} to={`/locations/${facilityId}`}>Quay lại cơ sở</Button>} />)

  const { facility: f, type: t, units, rent, deposit } = data
  const closed = !canBook(f)
  const booked = units.length === 0 || closed
  const name = prettyType(t.typeName)
  const bucket = sizeBucket(t)
  const checkout = `/checkout?facility=${f.id}&unitType=${t.id}`

  const specs = [
    { icon: Ruler, label: 'Kích thước', value: t.sizeDescription || dims(t) || '—' },
    { icon: Maximize2, label: 'Diện tích sàn', value: areaText(t) || '—' },
    { icon: MoveVertical, label: 'Chiều cao', value: t.height != null ? `${t.height} m` : '—' },
    { icon: Clock, label: 'Giờ mở cửa', value: hhmm(f.openingTime) ? `${hhmm(f.openingTime)} – ${hhmm(f.closingTime)}` : '—' },
  ]

  return (
    <section className="section">
      <div className="container">
        <Link to={`/locations/${f.id}`} className="utd-back"><ArrowLeft size={16} /> {f.name}</Link>

        {booked && (
          <div className="form-alert" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
            <AlertCircle size={18} /> {closed ? `Cơ sở này hiện ${stockOf(f).label.toLowerCase()} nên chưa nhận đặt kho.` : 'Mọi ô kho cỡ này đều đã được đặt. Vui lòng chọn cỡ khác hoặc quay lại sau.'}
          </div>
        )}

        <div className="utd-top">
          <Gallery type={t} booked={booked} />

          {/* Thẻ đặt chỗ, dính theo khi cuộn */}
          <aside className="utd-panel">
            <div className="utd-tags">
              {bucket && <span className="utd-tag">Kho {SIZE_LABEL[bucket].toLowerCase()}</span>}
              <span className={`ut-status utd-status ${booked ? 'is-out' : ''}`}><i />{booked ? 'Đã hết kho' : `Còn ${units.length} ô trống`}</span>
            </div>
            <h1 className="utd-title">{name}</h1>
            <p className="muted">{t.description || 'Ô kho sạch, khô ráo, an toàn, được giám sát 24/7.'}</p>

            <div className="utd-price">
              <span className="muted small">Giá thuê</span>
              <strong>{priceText(rent)}</strong>
            </div>
            <div className="utd-row"><Wallet size={16} /><span>Tiền cọc</span><strong>{depositText(deposit)}</strong></div>
            <div className="utd-row"><MapPin size={16} /><span>{f.name}</span></div>
            <p className="muted small utd-addr">{f.address}</p>

            <div className="utd-actions">
              <Link to={checkout} className={`btn-pill lg ${booked ? 'is-disabled' : ''}`} aria-disabled={booked} tabIndex={booked ? -1 : undefined}>
                <ShoppingBag size={17} /> Đặt cỡ kho này
              </Link>
              <Link to={`/account/support?new=1&facility=${f.id}&subject=${encodeURIComponent(`Câu hỏi về loại kho ${name}`)}`} className="btn-pill btn-pill-ghost lg">
                <MessageSquare size={17} /> Hỏi nhân viên
              </Link>
            </div>
            <p className="muted small utd-note"><ShieldCheck size={14} /> Ô kho được giữ cho bạn ngay khi tiền cọc được ghi nhận.</p>
          </aside>
        </div>

        {/* Thông số */}
        <div className="utd-specs">
          {specs.map(({ icon: Icon, label, value }) => (
            <div key={label} className="utd-spec">
              <span><Icon size={18} /></span>
              <div><small>{label}</small><strong>{value}</strong></div>
            </div>
          ))}
        </div>

        {/* Các ô kho còn trống của loại này (chỉ để xem số lượng): khách chọn loại kho, quản lý cơ sở gán ô cụ thể sau khi đặt */}
        <div className="utd-units-head">
          <div>
            <div className="eyebrow">Tình trạng kho</div>
            <h2>Các ô kho còn trống</h2>
          </div>
          <span className="muted">{units.length ? `Còn ${units.length} ô trống · ô cụ thể do quản lý cơ sở gán sau khi bạn đặt` : 'Hiện không còn ô trống'}</span>
        </div>
        {units.length === 0 ? (
          <EmptyState title="Đã hết kho" message="Mọi ô kho thuộc loại này đều đã được đặt." />
        ) : (
          <div className="utd-units">
            {units.map((u) => (
              <div key={u.id} className="utd-unit" onPointerMove={followLight} style={{ cursor: 'default' }}>
                <span className="utd-unit-icon"><DoorClosed size={22} /></span>
                <div className="utd-unit-body">
                  <strong>{u.unitCode}</strong>
                  <small>
                    {u.floor ? <><Layers size={12} /> Tầng {u.floor}</> : null}
                    {u.floor && u.location ? ' · ' : ''}
                    {u.location || (!u.floor ? 'Tầng trệt' : '')}
                  </small>
                </div>
                <span className="utd-unit-badge">Còn trống</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

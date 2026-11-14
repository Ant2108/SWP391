import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, Building2, Boxes, ShieldCheck, Headset, CreditCard, MapPinned } from 'lucide-react'
import { Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { photo } from '../utils/photo.js'

const HERO_IMG = photo('1565891741441-64926e441838', 'Toàn cảnh cơ sở kho nhìn từ trên cao với khu bốc dỡ hàng và xe tải')
const SMALL_IMG = photo('1586528116311-ad8dd3c8310d', 'Bên trong cơ sở kho với các dãy thùng màu vàng', [400, 640, 900])
import LocationCard from '../components/LocationCard.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { monthlyRate, pickRule } from '../utils/pricing.js'

const FILTERS = [
  { value: '', label: 'Tất cả cơ sở' },
  { value: 'AVAILABLE', label: 'Còn ô trống' },
]

const PERKS = [
  { icon: ShieldCheck, title: 'Giám sát an ninh 24/7', text: 'Mọi cơ sở đều được giám sát suốt ngày đêm.' },
  { icon: CreditCard, title: 'Đặt kho và thanh toán trực tuyến', text: 'Chọn kho, thanh toán an toàn là kho được giữ ngay.' },
  { icon: Headset, title: 'Nhân viên hỗ trợ tận tình', text: 'Hỏi về kích cỡ, giá hoặc lịch xem kho qua trang Hỗ trợ.' },
  { icon: MapPinned, title: 'Dễ tìm đường', text: 'Chỉ đường đến bất kỳ cơ sở nào chỉ với một lần bấm.' },
]

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

/** Mọi dữ liệu của trang: cơ sở đang hoạt động + loại kho + ô trống + (nếu đọc được) giá thuê. */
function useLocations() {
  return useAsync(async () => {
    const facilities = await api.facilities.list('ACTIVE')
    const [units, typeLists, rules] = await Promise.all([
      api.storageUnits.search({ status: 'AVAILABLE' }),
      Promise.all(facilities.map((f) => api.unitTypes.listByFacility(f.id))),
      api.priceRules.list().catch(() => []), // bảng giá là thông tin công khai (khách chưa đăng nhập cũng đọc được); nếu gọi lỗi thì bỏ qua phần "Từ …"
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
    { icon: Building2, value: data?.items.length, label: 'Cơ sở kho' },
    { icon: Boxes, value: data?.totalFree, label: 'Ô kho còn trống' },
  ]

  return (
    <section className="section">
      <div className="container">
        {/* Mở đầu: chữ + số liệu bên trái, ảnh cơ sở thật bên phải */}
        <div className="locx-hero">
          <div>
            <div className="eyebrow">Cơ sở kho</div>
            <h1 className="locx-title">Các cơ sở kho của chúng tôi</h1>
            <p className="lead">Chọn cơ sở gần nhà hoặc nơi làm việc, so sánh các loại kho và xem kho còn trống ngay bây giờ.</p>
            <div className="locx-stats">
              {stats.map(({ icon: Icon, value, label }) => (
                <div className="locx-stat" key={label}>
                  <span className="locx-stat-icon"><Icon size={20} /></span>
                  <div><strong>{value == null ? '—' : value}</strong><small>{label}</small></div>
                </div>
              ))}
            </div>
          </div>
          <div className="locx-visual">
            <figure className="locx-photo">
              <img src={HERO_IMG.src} srcSet={HERO_IMG.srcSet} sizes="(max-width: 900px) 92vw, 44vw" alt={HERO_IMG.alt} loading="eager" />
            </figure>
            <figure className="locx-photo locx-photo-small">
              <img src={SMALL_IMG.src} srcSet={SMALL_IMG.srcSet} sizes="(max-width: 900px) 40vw, 18vw" alt={SMALL_IMG.alt} loading="eager" />
            </figure>
            <div className="locx-float">
              <span className="locx-float-icon"><MapPinned size={18} /></span>
              <div><strong>{data?.items.length ?? '—'} cơ sở</strong><small>Trên khắp TP. Hồ Chí Minh</small></div>
            </div>
          </div>
        </div>

        <div className="ufilter" style={{ marginTop: 28 }}>
          <div className="ufilter-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên cơ sở, quận hoặc tên đường…" aria-label="Tìm cơ sở" />
            {q && <button type="button" className="ufilter-clear" onClick={() => setQ('')} aria-label="Xóa tìm kiếm"><X size={16} /></button>}
          </div>
          <div className="segmented" role="group" aria-label="Lọc cơ sở">
            {FILTERS.map((o) => (
              <button key={o.value} type="button" className={`seg ${filter === o.value ? 'active' : ''}`} aria-pressed={filter === o.value} onClick={() => setFilter(o.value)}>{o.label}</button>
            ))}
          </div>
        </div>

        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
          !data.items.length ? <EmptyState title="Chưa có cơ sở nào" message="Vui lòng quay lại sau." /> :
          !shown.length ? (
            <div className="no-match" role="status">
              <h3>Không có cơ sở nào khớp với tìm kiếm</h3>
              <p className="muted">Hãy thử tên hoặc khu vực khác, hoặc liên hệ nhân viên để được giúp tìm cơ sở phù hợp.</p>
              <div className="no-match-actions">
                <Button as={Link} to="/account/support?new=1&subject=T%C3%ACm%20c%C6%A1%20s%E1%BB%9F%20kho"><Headset size={18} /> Liên hệ nhân viên</Button>
                <Button variant="secondary" onClick={() => { setQ(''); setFilter('') }}>Xóa bộ lọc</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ margin: '4px 0 18px' }} aria-live="polite">Hiển thị {shown.length} / {data.items.length} cơ sở</p>
              <div className="fac-grid">
                {shown.map(({ f, free, types, fromPrice }) => <LocationCard key={f.id} f={f} free={free} types={types} fromPrice={fromPrice} />)}
              </div>
            </>
          )}

        <div className="perks">
          <div className="section-head" style={{ marginBottom: 28 }}>
            <div className="eyebrow">Tại mọi cơ sở</div>
            <h2 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Những gì quý khách nhận được</h2>
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
            <h2 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Chưa biết cơ sở nào phù hợp?</h2>
            <p>Cho chúng tôi biết quý khách định gửi gì, nhân viên sẽ gợi ý cơ sở và kích cỡ kho phù hợp.</p>
          </div>
          <div className="cta-actions">
            <Button as={Link} to="/storage-options" size="lg">Xem tất cả loại kho</Button>
            <Button as={Link} to="/account/support?new=1" variant="secondary" size="lg">Liên hệ nhân viên</Button>
          </div>
        </div>
      </div>
    </section>
  )
}

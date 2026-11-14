import { Link } from 'react-router-dom'
import {
  Check, ArrowRight, Warehouse, CreditCard, CalendarCheck, FileSignature, RefreshCcw,
  PackageOpen, ShieldCheck, Headset, Boxes, Tag, MapPinned, Search, KeyRound,
} from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'
import { pickRule } from '../utils/pricing.js'
import { photo } from '../utils/photo.js'

const IMG = {
  hero: photo('1586528116311-ad8dd3c8310d', 'Sàn cơ sở kho với các dãy thùng màu vàng và kệ hàng'),
  heroSmall: photo('1553413077-190dd305871c', 'Lối đi dài với kệ chứa các thùng hàng', [400, 640, 900]),
  personal: photo('1520038410233-7141be7e6f97', 'Chú chó ló đầu ra khỏi thùng hàng khi chuyển nhà'),
  business: photo('1587293852726-70cdb56c2866', 'Pallet hàng thùng trên kệ kho cao'),
  security: photo('1557597774-9d273605dfa9', 'Dãy camera an ninh', [400, 640, 900]),
  support: photo('1590650153855-d9e808231d41', 'Nhân viên sẵn sàng hỗ trợ tại quầy', [400, 640, 900]),
  cta: photo('1580674285054-bed31e145f59', 'Thùng hàng và bưu kiện xếp chồng', [800, 1200, 1600]),
}

// Dịch vụ thuê kho tiêu chuẩn (đúng với những gì hệ thống đang cho thuê: ô kho theo tháng).
const SOLUTION = {
  photos: [IMG.personal, IMG.business],
  title: 'Ô kho tiêu chuẩn',
  text: 'Ô kho khô ráo, an toàn, thuê theo tháng. Dùng khi nhà cần thêm chỗ, lúc chuyển nhà, hoặc làm nơi cất hàng hóa, thiết bị và hồ sơ.',
  goodFor: ['Nội thất và đồ gia dụng', 'Thùng hàng khi chuyển nhà', 'Đồ theo mùa và dụng cụ thể thao', 'Hàng hóa tồn kho', 'Thiết bị và dụng cụ', 'Tài liệu và hồ sơ lưu trữ'],
  included: ['Ô kho sạch, khô, thông thoáng', 'Giám sát an ninh 24/7', 'Thuê theo tháng, gia hạn dễ dàng', 'Tiền cọc được hoàn lại cuối hợp đồng'],
}

// Dịch vụ đi kèm mỗi lần thuê — mỗi mục ứng với một chức năng có thật trong tài khoản khách.
const INCLUDED = [
  { icon: CreditCard, title: 'Đặt kho và thanh toán trực tuyến', text: 'Chọn loại kho, đóng cọc qua mã QR là ô kho được giữ cho bạn.', to: '/storage-options', cta: 'Tìm kho phù hợp' },
  { icon: CalendarCheck, title: 'Lịch hẹn nhận kho', text: 'Chọn giờ đến cơ sở để nhận kho và chuyển đồ vào, có nhân viên hỗ trợ tại chỗ.', to: '/account/appointments', cta: 'Xem lịch hẹn' },
  { icon: FileSignature, title: 'Hợp đồng điện tử', text: 'Đọc và ký hợp đồng thuê kho trực tuyến, xem và tải hóa đơn bất cứ lúc nào.', to: '/account/contracts', cta: 'Hợp đồng của tôi' },
  { icon: RefreshCcw, title: 'Gia hạn dễ dàng', text: 'Gia hạn hợp đồng ngay trong tài khoản trước khi hết hạn, không cần giấy tờ.', to: '/account/contracts', cta: 'Gia hạn hợp đồng' },
  { icon: PackageOpen, title: 'Trả kho', text: 'Đặt lịch trả kho khi không còn nhu cầu, nhân viên kiểm tra và hoàn tiền cọc theo quy định.', to: '/account/contracts', cta: 'Hợp đồng của tôi' },
  { icon: Headset, title: 'Hỗ trợ từ nhân viên', text: 'Hỏi về kích cỡ, giá hoặc hợp đồng của bạn và nhận phản hồi từ nhân viên cơ sở.', to: '/support', cta: 'Đặt câu hỏi' },
]

const STEPS = [
  { icon: Search, title: 'Chọn loại kho', text: 'So sánh cơ sở, kích cỡ kho và xem ô nào còn trống ngay bây giờ.' },
  { icon: CreditCard, title: 'Đóng cọc để đặt kho', text: 'Ô kho được giữ cho bạn ngay khi tiền cọc được ghi nhận.' },
  { icon: FileSignature, title: 'Ký hợp đồng trực tuyến', text: 'Điền hồ sơ và ký hợp đồng ngay trong tài khoản, không cần in giấy.' },
  { icon: KeyRound, title: 'Nhận kho', text: 'Đến cơ sở theo lịch hẹn để nhận kho và quản lý mọi thứ trong mục Kho của tôi.' },
]

/** Giá thuê thấp nhất, số cơ sở và tổng số ô còn trống. Lỗi thì ẩn phần số liệu. */
function useServiceStats() {
  return useAsync(async () => {
    const [facilities, rules, units] = await Promise.all([
      api.facilities.list('ACTIVE'),
      api.priceRules.list().catch(() => []),
      api.storageUnits.search({ status: 'AVAILABLE' }),
    ])
    const typeLists = await Promise.all(facilities.map((f) => api.unitTypes.listByFacility(f.id)))
    let from = null
    facilities.forEach((f, i) => typeLists[i].filter((t) => t.active).forEach((t) => {
      const rule = pickRule(rules, 'RENTAL', f.id, t.id)
      if (rule && rule.calculationType !== 'PERCENTAGE' && (from == null || Number(rule.amount) < from)) from = Number(rule.amount)
    }))
    return { from, available: units.length, facilities: facilities.length }
  })
}

const Img = ({ img, sizes, eager }) => (
  <img src={img.src} srcSet={img.srcSet} sizes={sizes} alt={img.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
)

// Ánh sáng nhẹ chạy theo chuột (dùng chung kiểu thẻ với trang Locations).
const followLight = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function Services() {
  const s = useServiceStats().data

  return (
    <>
      <section className="section">
        <div className="container">
          {/* Mở đầu: chữ + số liệu thật bên trái, ảnh kho thật bên phải */}
          <div className="locx-hero">
            <div>
              <div className="eyebrow">Dịch vụ</div>
              <h1 className="locx-title">Kho cho mọi nhu cầu</h1>
              <p className="lead">Ô kho an toàn, linh hoạt cho đồ dùng hằng ngày và hàng hóa kinh doanh, với đặt kho, hợp đồng và hỗ trợ hoàn toàn trực tuyến.</p>
              <div className="locx-stats">
                <div className="locx-stat">
                  <span className="locx-stat-icon"><Tag size={20} /></span>
                  <div><strong>{s?.from != null ? money(s.from) : '—'}</strong><small>Từ / tháng</small></div>
                </div>
                <div className="locx-stat">
                  <span className="locx-stat-icon"><Boxes size={20} /></span>
                  <div><strong>{s ? s.available : '—'}</strong><small>Ô kho còn trống</small></div>
                </div>
              </div>
              <div className="about-actions">
                <Link to="/storage-options" className="btn-pill lg">Tìm ô kho <ArrowRight size={18} /></Link>
                <Link to="/pricing" className="btn-pill btn-pill-ghost lg">Xem bảng giá</Link>
              </div>
            </div>
            <div className="locx-visual">
              <figure className="locx-photo"><Img img={IMG.hero} sizes="(max-width: 900px) 92vw, 44vw" eager /></figure>
              <figure className="locx-photo locx-photo-small"><Img img={IMG.heroSmall} sizes="(max-width: 900px) 40vw, 18vw" eager /></figure>
              <div className="locx-float">
                <span className="locx-float-icon"><MapPinned size={18} /></span>
                <div><strong>{s ? `${s.facilities} cơ sở kho` : 'Cơ sở kho'}</strong><small>Giám sát 24/7</small></div>
              </div>
            </div>
          </div>

          {/* Hai giải pháp chính, mỗi giải pháp có ảnh thật */}
          <div className="section-head" style={{ marginBottom: 28 }}>
            <div className="eyebrow">Giải pháp lưu trữ</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,42px)' }}>Chọn loại kho phù hợp với bạn</h2>
          </div>
          {/* Một thẻ chung: ảnh hộ gia đình + doanh nghiệp bên trái, nội dung gộp bên phải */}
          <article className="svc-solution svc-one">
            <div className="svc-one-photos">
              {SOLUTION.photos.map((img) => (
                <figure key={img.src} className="svc-solution-photo">
                  <Img img={img} sizes="(max-width: 900px) 50vw, 25vw" />
                </figure>
              ))}
            </div>
            <div className="svc-solution-body">
              <h3>{SOLUTION.title}</h3>
              <p className="muted">{SOLUTION.text}</p>
              <div className="svc-meta">
                <span><Boxes size={15} /> Từ kho nhỏ đến kho rất lớn</span>
                {s?.from != null && <span><Tag size={15} /> Từ {money(s.from)} / tháng</span>}
                {s && <span><ShieldCheck size={15} /> Còn {s.available} ô trống</span>}
              </div>
              <div className="svc-group">
                <div className="svc-group-head"><span><Warehouse size={15} /></span>Phù hợp để lưu trữ</div>
                <ul className="svc-list svc-list-2">
                  {SOLUTION.goodFor.map((b) => <li key={b}><Check size={16} />{b}</li>)}
                </ul>
              </div>
              <div className="svc-group">
                <div className="svc-group-head"><span><Check size={15} /></span>Quyền lợi đi kèm</div>
                <ul className="svc-list svc-list-2">
                  {SOLUTION.included.map((b) => <li key={b}><Check size={16} />{b}</li>)}
                </ul>
              </div>
              <div className="svc-actions">
                <Link to="/storage-options" className="btn-pill">Xem các loại kho <ArrowRight size={16} /></Link>
                <Link to={`/account/support?new=1&subject=${encodeURIComponent('Tư vấn chọn ô kho')}`} className="btn-pill btn-pill-ghost">Nhận tư vấn</Link>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Dịch vụ đi kèm */}
      <section className="section band">
        <div className="container">
          <div className="lp-section-head">
            <div>
              <div className="eyebrow">Đi kèm mỗi hợp đồng thuê</div>
              <h2>Mọi thứ bạn cần, xử lý trực tuyến</h2>
            </div>
            <p>Mỗi dịch vụ dưới đây đều nằm trong tài khoản SafeSpace của bạn. Không giấy tờ rườm rà.</p>
          </div>
          <div className="svc-grid">
            {INCLUDED.map(({ icon: Icon, title, text, to, cta }) => (
              <article key={title} className="fac-card svc-card" onPointerMove={followLight}>
                <span className="fac-icon"><Icon size={22} /></span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
                <Link to={to} className="svc-link">{cta} <ArrowRight size={15} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* An ninh & hỗ trợ: 2 ảnh thật */}
      <section className="section">
        <div className="container svc-duo">
          <article className="about-gallery-card">
            <figure className="about-photo"><Img img={IMG.security} sizes="(max-width: 800px) 100vw, 50vw" /></figure>
            <div className="about-gallery-body">
              <span className="about-gallery-icon"><ShieldCheck size={16} /></span>
              <h3>An ninh ở mọi cơ sở</h3>
              <p>Camera suốt ngày đêm, kiểm soát ra vào và nhân viên có mặt trong giờ mở cửa.</p>
            </div>
          </article>
          <article className="about-gallery-card">
            <figure className="about-photo"><Img img={IMG.support} sizes="(max-width: 800px) 100vw, 50vw" /></figure>
            <div className="about-gallery-body">
              <span className="about-gallery-icon"><Headset size={16} /></span>
              <h3>Có người thật hỗ trợ bạn</h3>
              <p>Chưa biết cần cỡ kho nào? Hãy gửi tin nhắn, nhân viên cơ sở sẽ tư vấn cho bạn.</p>
            </div>
          </article>
        </div>
      </section>

      {/* Quy trình */}
      <section className="section band">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'center', margin: '0 auto 40px' }}>
            <div className="eyebrow">Quy trình</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,42px)' }}>Từ đặt kho đến nhận kho trong bốn bước</h2>
          </div>
          <div className="steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div className="step" key={title}>
                <span className="step-num">0{i + 1}</span>
                <div className="icon-tile"><Icon size={24} /></div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lời kêu gọi có ảnh nền thật */}
      <section className="section">
        <div className="container">
          <div className="cta-band lp-cta">
            <div className="lp-cta-photo" aria-hidden="true"><Img img={IMG.cta} sizes="100vw" /></div>
            <div>
              <h2>Sẵn sàng giải phóng thêm không gian?</h2>
              <p>Xem tình trạng còn trống ở mọi cơ sở và đặt ô kho của bạn chỉ trong vài phút.</p>
            </div>
            <div className="cta-actions">
              <Link to="/storage-options" className="btn-pill lg">Tìm ô kho của bạn <ArrowRight size={18} /></Link>
              <Link to="/locations" className="btn-pill lg lp-cta-ghost">Xem các cơ sở kho</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

import { lazy, Suspense, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  MapPin,
  Phone,
  ArrowRight,
  Search,
  CreditCard,
  PackageCheck,
  Boxes,
  Ruler,
} from 'lucide-react'
import Hero from '../components/landing/Hero.jsx'
import FeatureBento from '../components/landing/FeatureBento.jsx'
import { useSmoothScroll } from '../hooks/useSmoothScroll.js'
import { Button, Card, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import QuickSearch from '../components/QuickSearch.jsx'
import Faq from '../components/Faq.jsx'
import { FAQ } from '../data/faq.js'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { stockOf } from '../utils/facility.js'
import Warehouse3DLoading from '../components/storage/Warehouse3DLoading.jsx'

// Tải trễ mô hình 3D để trang chủ mở nhanh hơn
const Warehouse3D = lazy(() => import('../components/storage/Warehouse3D.jsx'))

gsap.registerPlugin(ScrollTrigger, useGSAP)

// Quy trình thuê kho 4 bước (khớp luồng thật của hệ thống).
const FOUR_STEPS = [
  {
    num: '01',
    icon: Search,
    title: 'Tìm cơ sở kho',
    desc: 'Xem các cơ sở kho gần nhà hoặc nơi làm việc, lọc theo khu vực, kích cỡ kho và tình trạng còn trống.',
  },
  {
    num: '02',
    icon: Boxes,
    title: 'Chọn loại kho',
    desc: 'Xem mô hình 3D của cơ sở, so sánh kích thước, giá thuê và tiền cọc rồi chọn loại kho phù hợp.',
  },
  {
    num: '03',
    icon: CreditCard,
    title: 'Đặt kho và đóng cọc',
    desc: 'Giá và tiền cọc hiển thị rõ ràng. Thanh toán cọc bằng mã QR, đơn được ghi nhận tự động khi tiền về.',
  },
  {
    num: '04',
    icon: PackageCheck,
    title: 'Ký hợp đồng và nhận kho',
    desc: 'Điền hồ sơ, ký hợp đồng điện tử, đến cơ sở theo lịch hẹn để nhận chìa khóa và bắt đầu sử dụng kho.',
  },
]

// Hướng dẫn chọn cỡ kho (kích thước chỉ mang tính tham khảo; giá thực tế xem ở trang Bảng giá của từng cơ sở).
const UNIT_SIZES = [
  {
    id: 'S',
    name: 'Kho nhỏ (S)',
    dimensions: '1,2m × 1,5m × 2,4m',
    area: 'đến 5 m²',
    volume: '≈ 4 m³',
    badge: 'Phù hợp cá nhân',
    startingPrice: 'Xem giá ở Bảng giá',
    suitableBelongings: 'Vali, 10–20 thùng chuyển nhà, đồ theo mùa, dụng cụ thể thao, đồ của sinh viên.',
    capacityVisual: 'Chứa khoảng 15 thùng tiêu chuẩn hoặc 1 xe máy kèm hành lý',
    link: '/storage-options?size=S',
  },
  {
    id: 'M',
    name: 'Kho vừa (M)',
    dimensions: '2,5m × 3,0m × 2,6m',
    area: '5 – 13 m²',
    volume: '≈ 19 m³',
    badge: 'Phù hợp nhà 1–2 phòng',
    startingPrice: 'Xem giá ở Bảng giá',
    suitableBelongings: 'Nội thất nhà 1–2 phòng ngủ, ghế sofa, giường, máy giặt, tủ lạnh, hơn 40 thùng đồ.',
    capacityVisual: 'Chứa khoảng 50 thùng tiêu chuẩn hoặc căn hộ 1–2 phòng',
    link: '/storage-options?size=M',
  },
  {
    id: 'L',
    name: 'Kho lớn (L)',
    dimensions: '3,2m × 4,0m × 2,8m',
    area: '13 – 30 m²',
    volume: '≈ 36 m³',
    badge: 'Phù hợp cả căn nhà',
    startingPrice: 'Xem giá ở Bảng giá',
    suitableBelongings: 'Đồ đạc nhà 3–4 phòng ngủ, bộ bàn ăn, thiết bị gia dụng, đồ ngoài trời, chuyển nhiều phòng.',
    capacityVisual: 'Chứa khoảng 80–120 thùng hoặc nhà gia đình 3 phòng ngủ',
    link: '/storage-options?size=L',
  },
  {
    id: 'XL',
    name: 'Kho thương mại (XL)',
    dimensions: '4,2m × 5,0m × 3,2m',
    area: 'trên 30 m²',
    volume: '≈ 67 m³',
    badge: 'Dành cho doanh nghiệp',
    startingPrice: 'Xem giá ở Bảng giá',
    suitableBelongings: 'Hàng thương mại điện tử, 4–8 pallet hàng, nội thất văn phòng, hàng bán lẻ.',
    capacityVisual: 'Chứa khoảng 6 pallet tiêu chuẩn cùng kệ chứa hàng công nghiệp',
    link: '/storage-options?size=XL',
  },
]

// Chưa có dữ liệu từ backend thì hiện trạng thái trống, không bịa số liệu.
const FALLBACK_DATA = { facilities: [], available: 0, byFacility: {}, types: 0 }

function useHomeData() {
  return useAsync(async () => {
    try {
      const [facilities, units] = await Promise.all([
        api.facilities.list('ACTIVE'),
        api.storageUnits.search({ status: 'AVAILABLE' }),
      ])
      if (!facilities || facilities.length === 0) return FALLBACK_DATA
      const active = new Set(facilities.map((f) => f.id))
      const open = units.filter((u) => active.has(u.facilityId))
      const byFacility = open.reduce((m, u) => ({ ...m, [u.facilityId]: (m[u.facilityId] || 0) + 1 }), {})
      const types = new Set(open.map((u) => `${u.facilityId}:${u.unitTypeId}`)).size
      return { facilities, available: open.length, byFacility, types }
    } catch {
      return FALLBACK_DATA
    }
  })
}

export default function Home() {
  const { data, loading, error, reload } = useHomeData()
  const homeRef = useRef(null)
  const activeData = data || FALLBACK_DATA

  useSmoothScroll()

  // Hiện dần các thẻ khi cuộn tới (hero và bento có hiệu ứng riêng trong component của chúng).
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        ScrollTrigger.batch('.anim-card', {
          interval: 0.1,
          start: 'top 88%',
          onEnter: (batch) => gsap.fromTo(batch, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.65, ease: 'power2.out' }),
        })
        ScrollTrigger.batch('.step-card', {
          interval: 0.1,
          start: 'top 85%',
          onEnter: (batch) => gsap.fromTo(batch, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.7, ease: 'power2.out' }),
        })
      })
    },
    { scope: homeRef }
  )

  const stats = {
    facilities: activeData.facilities?.length ?? 0,
    available: activeData.available ?? 0,
  }

  return (
    <div className="home-container" ref={homeRef}>
      <Hero stats={stats} />

      {/* Tìm nhanh kho trống */}
      <div className="container" style={{ position: 'relative', zIndex: 10 }}>
        <QuickSearch facilities={activeData.facilities || []} />
      </div>

      <FeatureBento />

      {/* ========================================================
          SECTION 2 — EXPLORE OUR STORAGE FACILITIES
          ======================================================== */}
      <section className="section" id="facilities-section">
        <div className="container">
          <div className="page-header">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <div className="eyebrow">Cơ sở kho</div>
              <h2>Khám phá các cơ sở kho của chúng tôi</h2>
              <p className="lead" style={{ margin: '8px 0 0' }}>
                Các cơ sở kho an toàn, hiện đại, đặt tại những vị trí thuận tiện trong thành phố.
              </p>
            </div>
            <Button as={Link} to="/locations" variant="secondary">
              Tất cả cơ sở <ArrowRight size={18} />
            </Button>
          </div>

          {loading ? (
            <LoadingState />
          ) : error && !activeData.facilities.length ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <div className="loc-scroller" style={{ marginTop: 32 }}>
              {activeData.facilities.slice(0, 8).map((f) => (
                <Card hover key={f.id} className="loc-card anim-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <h3>{f.name}</h3>
                    {f.stockStatus && f.stockStatus !== 'AVAILABLE' ? (
                      <Badge tone={stockOf(f).tone}>{stockOf(f).label}</Badge>
                    ) : (
                      <Badge tone={activeData.byFacility[f.id] > 0 ? 'green' : 'neutral'}>
                        {activeData.byFacility[f.id] > 0
                          ? `Còn ${activeData.byFacility[f.id]} ô trống`
                          : 'Đã hết kho'}
                      </Badge>
                    )}
                  </div>
                  <div className="meta" style={{ marginTop: 10 }}>
                    <MapPin size={18} />
                    <span>{f.address}</span>
                  </div>
                  {f.phone && (
                    <div className="meta">
                      <Phone size={18} />
                      <span>{f.phone}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                    <Button as={Link} to={`/locations/${f.id}`} size="sm">
                      Xem cơ sở
                    </Button>
                    <Button as={Link} to={`/storage-options?facility=${f.id}`} variant="secondary" size="sm">
                      Xem các loại kho
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========================================================
          SECTION 3 — EXPLORE THE 3D STORAGE FACILITY
          ======================================================== */}
      <section className="section band" id="facility-explorer-3d">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'center', margin: '0 auto 40px' }}>
            <div className="eyebrow">Khám phá cơ sở kho 3D</div>
            <h2>Xem cơ sở kho trong không gian 3D</h2>
            <p className="lead" style={{ margin: '12px auto 0' }}>
              Mỗi cỡ kho có một kho mẫu dựng đúng tỉ lệ. Bấm vào một cỡ để mở cửa và xem đồ đạc có thể chứa bên trong, đặt cạnh người cao 1,7 m.
            </p>
          </div>

          <Suspense fallback={<Warehouse3DLoading />}>
            <Warehouse3D facilityId={activeData.facilities?.[0]?.id || 0} facilities={activeData.facilities || []} />
          </Suspense>
        </div>
      </section>

      {/* ========================================================
          SECTION 4 — FIND YOUR PERFECT UNIT (SIZE GUIDE)
          ======================================================== */}
      <section className="section" id="size-guide">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'center', margin: '0 auto 48px' }}>
            <div className="eyebrow">Hướng dẫn chọn cỡ kho</div>
            <h2>Tìm ô kho phù hợp với bạn</h2>
            <p className="lead" style={{ margin: '12px auto 0' }}>
              Từ ô kho nhỏ cho cá nhân đến khu kho thương mại, chọn đúng không gian phù hợp với đồ đạc của bạn.
            </p>
          </div>

          <div className="grid grid-4">
            {UNIT_SIZES.map((size) => (
              <div key={size.id} className="unit-bucket-card anim-card">
                <div className="bucket-top">
                  <span className="bucket-badge">{size.id}</span>
                  <span className="bucket-range">{size.area}</span>
                </div>
                <h3 className="bucket-title">{size.name}</h3>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                  <Ruler size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {size.dimensions} · {size.volume}
                </div>
                <p className="bucket-desc">{size.suitableBelongings}</p>
                <div className="bucket-fits">
                  <strong>Sức chứa ước tính:</strong>
                  {size.capacityVisual}
                </div>
                <div className="bucket-foot">
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{size.startingPrice}</span>
                  <Link to={size.link} className="bucket-link">
                    Chọn <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          SECTION 5 — HOW IT WORKS (FOUR-STEP PROCESS)
          ======================================================== */}
      <section className="section band" id="how-it-works">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'center', margin: '0 auto 48px' }}>
            <div className="eyebrow">Quy trình đơn giản</div>
            <h2>Thuê kho chỉ với bốn bước</h2>
            <p className="lead" style={{ margin: '12px auto 0' }}>
              Thuê thêm không gian chưa bao giờ dễ hơn: toàn bộ quy trình đặt kho, thanh toán và ký hợp đồng đều thực hiện trực tuyến.
            </p>
          </div>
          <div className="steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {FOUR_STEPS.map(({ num, icon: Icon, title, desc }) => (
              <div className="step step-card" key={title}>
                <span className="step-num">{num}</span>
                <div className="icon-tile">
                  <Icon size={26} />
                </div>
                <h3>{title}</h3>
                <p className="muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          FAQ SECTION
          ======================================================== */}
      <section className="section band">
        <div className="container faq-layout">
          <div>
            <div className="eyebrow">Câu hỏi thường gặp</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,40px)' }}>Giải đáp thắc mắc</h2>
            <p className="muted" style={{ marginTop: 12 }}>
              Chưa tìm thấy điều cần biết? Quản lý cơ sở và nhân viên hỗ trợ luôn sẵn sàng giúp bạn.
            </p>
            <Button as={Link} to="/account/support?new=1" variant="secondary" style={{ marginTop: 24 }}>
              Liên hệ nhân viên
            </Button>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      {/* ========================================================
          SECTION 7 — FINAL CTA
          ======================================================== */}
      <section className="section">
        <div className="container">
          <div className="cta-band lp-cta anim-card">
            <div className="lp-cta-photo" aria-hidden="true">
              <img src="https://images.unsplash.com/photo-1553413077-190dd305871c?w=1600&q=70&auto=format&fit=crop" alt="" loading="lazy" decoding="async" />
            </div>
            <div>
              <h2>Không gian thêm của bạn bắt đầu từ đây.</h2>
              <p>Tìm ô kho phù hợp ngay, xem tình trạng còn trống trực tiếp và đặt chỗ chỉ trong vài phút.</p>
            </div>
            <div className="cta-actions">
              <Link to="/storage-options" className="btn-pill lg">Tìm ô kho của bạn <ArrowRight size={18} /></Link>
              <Link to="/pricing" className="btn-pill lg lp-cta-ghost">Xem bảng giá</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

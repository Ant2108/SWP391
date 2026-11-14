import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { LayoutDashboard, ShieldCheck, MapPin, BadgePercent, ArrowRight, Unlock } from 'lucide-react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// Ảnh thật từ Unsplash, tải theo kích thước màn hình.
const img = (id, alt) => ({
  src: `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`,
  srcSet: [640, 1000, 1600].map((w) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop ${w}w`).join(', '),
  alt,
})
const PHOTOS = {
  manage: img('1586528116311-ad8dd3c8310d', 'Kho sáng sủa với các dãy thùng chứa màu vàng và kệ hàng'),
  security: img('1557597774-9d273605dfa9', 'Dãy camera an ninh'),
  locations: img('1565891741441-64926e441838', 'Toàn cảnh cơ sở kho nhìn từ trên cao với khu bốc dỡ hàng'),
}

function Photo({ photo, sizes }) {
  return (
    <div className="bento-media" aria-hidden="false">
      <div className="bento-parallax">
        <img src={photo.src} srcSet={photo.srcSet} sizes={sizes} alt={photo.alt} loading="lazy" decoding="async" />
      </div>
    </div>
  )
}

export default function FeatureBento() {
  const root = useRef(null)

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set('.bento-card', { autoAlpha: 0, y: 40 })
      ScrollTrigger.batch('.bento-card', {
        start: 'top 90%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', clearProps: 'transform' }),
      })
      // Parallax trong từng ảnh: ảnh trượt chậm hơn khung thẻ.
      gsap.utils.toArray('.bento-parallax').forEach((el) => {
        gsap.fromTo(el, { yPercent: -6 }, {
          yPercent: 6, ease: 'none',
          scrollTrigger: { trigger: el.closest('.bento-card'), start: 'top bottom', end: 'bottom top', scrub: true },
        })
      })
    })
  }, { scope: root })

  return (
    <section className="lp-features" id="features" ref={root}>
      <div className="container">
        <div className="lp-section-head">
          <div>
            <div className="eyebrow">Vì sao chọn SafeSpace</div>
            <h2>Mọi thứ về kho của bạn, ở một nơi.</h2>
          </div>
          <p>Đặt, thanh toán và theo dõi ô kho trực tuyến. Chúng tôi lo an ninh, bảo trì và tòa nhà.</p>
        </div>

        <div className="bento">
          <article className="bento-card bento-a">
            <Photo photo={PHOTOS.manage} sizes="(max-width: 1024px) 100vw, 60vw" />
            <div className="bento-shade" />
            <span className="bento-tag"><LayoutDashboard size={14} /> Tự quản lý</span>
            <div className="bento-widget" aria-hidden="true">
              <div className="bw-head">
                <div><strong>Ô B-12</strong><small>Vừa · 7,5 m²</small></div>
                <span className="bw-status"><Unlock size={12} /> Đang mở</span>
              </div>
              <div className="bw-bar"><i /></div>
              <div className="bw-meta"><span>Không gian đã dùng</span><span>68%</span></div>
              <div className="bw-code"><span>Hạn thuê còn</span><b>25 ngày</b></div>
            </div>
            <div className="bento-body">
              <h3>Quản lý ô kho trong một tài khoản</h3>
              <p>Xem hợp đồng, thanh toán và lịch hẹn ở một nơi, gia hạn chỉ với vài thao tác.</p>
            </div>
          </article>

          <article className="bento-card bento-b">
            <Photo photo={PHOTOS.security} sizes="(max-width: 1024px) 100vw, 42vw" />
            <div className="bento-shade" />
            <span className="bento-tag"><ShieldCheck size={14} /> An ninh</span>
            <div className="bento-body">
              <h3>Giám sát 24/7</h3>
              <div className="bento-chips"><span>Camera</span><span>Cổng mã PIN</span><span>Báo động ô kho</span><span>Nhân viên tại chỗ</span></div>
            </div>
          </article>

          <article className="bento-card bento-c">
            <Photo photo={PHOTOS.locations} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
            <div className="bento-shade" />
            <span className="bento-tag"><MapPin size={14} /> Cơ sở kho</span>
            <div className="bento-body">
              <h3>Gần nhà bạn</h3>
              <p><Link to="/locations" style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Khu bốc dỡ hàng gần bạn <ArrowRight size={14} /></Link></p>
            </div>
          </article>

          <article className="bento-card bento-solid bento-d">
            <span className="bento-icon"><BadgePercent size={22} /></span>
            <div>
              <div className="bento-big">0₫</div>
              <p>phí ẩn. Giá và tiền cọc hiển thị rõ trước khi thanh toán.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

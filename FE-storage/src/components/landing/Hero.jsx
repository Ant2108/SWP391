import { lazy, Suspense, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { ArrowRight, Box } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme.jsx'

const HeroStorage3D = lazy(() => import('./HeroStorage3D.jsx'))

gsap.registerPlugin(ScrollTrigger, useGSAP)

export default function Hero({ stats }) {
  const root = useRef(null)
  const scrollRef = useRef(0) // tiến độ cuộn của hero (0 → 1), cảnh 3D đọc để nghiêng theo
  const { theme } = useTheme()

  useGSAP(() => {
    const range = { trigger: root.current, start: 'top top', end: 'bottom top' }
    ScrollTrigger.create({ ...range, onUpdate: (s) => { scrollRef.current = s.progress } })

    const mm = gsap.matchMedia()
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1025px)' }, (ctx) => {
      const { motion, desktop } = ctx.conditions
      if (!motion) return

      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.lp-reveal', { autoAlpha: 0, y: 28, duration: 0.9, stagger: 0.08 })
        .from('.lp-visual', { autoAlpha: 0, scale: 0.94, duration: 1.2 }, 0.1)

      // Parallax 3D: chữ trôi chậm, hình trôi nhanh hơn và ngả ra sau, quầng sáng trôi ngược.
      const scrub = { ...range, scrub: true }
      // fromTo với giá trị đầu rõ ràng: không phụ thuộc trạng thái đang có lúc tạo (tránh bị kẹt ở ẩn).
      gsap.fromTo('.lp-copy', { yPercent: 0, opacity: 1 }, { yPercent: desktop ? -12 : -5, opacity: 0.35, ease: 'none', scrollTrigger: scrub })
      gsap.fromTo('.lp-visual-inner', { yPercent: 0, rotateX: 0, z: 0 }, { yPercent: desktop ? -16 : -6, rotateX: desktop ? 10 : 4, z: -80, ease: 'none', scrollTrigger: scrub })
      gsap.fromTo('.lp-hero-photo', { scale: 1.08 }, { scale: 1, duration: 1.8, ease: 'power2.out' })
      gsap.to('.lp-hero-photo img', { yPercent: 18, ease: 'none', scrollTrigger: scrub })
      gsap.to('.lp-glow-a', { yPercent: -25, autoAlpha: 0, ease: 'none', scrollTrigger: scrub })
      gsap.to('.lp-glow-b', { yPercent: -30, autoAlpha: 0, ease: 'none', scrollTrigger: scrub })
    })
  }, { scope: root })

  return (
    <section className="lp-hero" ref={root}>
      <div className="lp-hero-bg" aria-hidden="true">
        <div className="lp-hero-photo">
          <img
            src="https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=1920&q=70&auto=format&fit=crop"
            srcSet={[960, 1600, 2400].map((w) => `https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=${w}&q=70&auto=format&fit=crop ${w}w`).join(', ')}
            sizes="100vw"
            alt=""
            fetchpriority="high"
          />
        </div>
        <span className="lp-glow lp-glow-a" />
        <span className="lp-glow lp-glow-b" />
      </div>
      <div className="container lp-hero-grid">
        <div className="lp-copy">
          <span className="lp-kicker lp-reveal"><b>Mới</b> Thuê và quản lý ô kho hoàn toàn trực tuyến</span>
          <h1 className="lp-title lp-reveal">
            Kho của bạn, <span className="lp-mark">bạn làm chủ</span>, ở bất cứ đâu.
          </h1>
          <p className="lp-desc lp-reveal">
            Tìm ô kho an toàn gần bạn, đặt trong vài phút, rồi quản lý hợp đồng, thanh toán và lịch hẹn trong một tài khoản đơn giản.
          </p>
          <div className="lp-actions lp-reveal">
            <Link to="/storage-options" className="btn-pill lg">Tìm ô kho của bạn <ArrowRight size={18} /></Link>
            <Link to="/pricing" className="btn-pill btn-pill-ghost lg">Xem bảng giá</Link>
            <a href="#facility-explorer-3d" className="btn-pill btn-pill-ghost lg"
              onClick={(e) => { const el = document.getElementById('facility-explorer-3d'); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }}>
              <Box size={18} /> Xem sơ đồ 3D
            </a>
          </div>
          <ul className="lp-stats lp-reveal" aria-label="Tình trạng còn trống hiện tại">
            <li><strong>{stats.facilities}</strong><span>Cơ sở kho</span></li>
            <li><strong>{stats.available}</strong><span>Ô kho còn trống</span></li>
            <li><strong>24/7</strong><span>Giám sát ra vào</span></li>
          </ul>
        </div>

        <div className="lp-visual">
          <div className="lp-visual-inner">
            <Suspense fallback={<div className="lp-visual-skeleton" />}>
              <HeroStorage3D theme={theme} scrollRef={scrollRef} />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Brand } from '../layouts/PublicLayout.jsx'
import { photo } from '../utils/photo.js'

// Ảnh kho thật, tự chuyển mỗi 2 giây. Mỗi ảnh có một dòng chú thích ngắn về dịch vụ.
const SLIDES = [
  { img: photo('1553413077-190dd305871c', 'Lối đi trong kho dài với kệ cao chứa nhiều thùng hàng', [640, 1000, 1400]), text: 'Theo dõi ô kho của bạn ngay trên điện thoại, ở bất cứ đâu.', sub: 'Thuê, thanh toán và hợp đồng trong một tài khoản' },
  { img: photo('1586528116311-ad8dd3c8310d', 'Sàn cơ sở kho với các dãy thùng màu vàng', [640, 1000, 1400]), text: 'Đủ mọi kích cỡ kho, sẵn sàng khi bạn cần.', sub: 'Từ vài thùng hàng đến cả một căn phòng' },
  { img: photo('1565891741441-64926e441838', 'Toàn cảnh cơ sở kho nhìn từ trên cao với khu bốc dỡ hàng', [640, 1000, 1400]), text: 'Lái xe tới, dỡ hàng là xong.', sub: 'Khu bốc dỡ hàng tại các cơ sở của chúng tôi' },
  { img: photo('1587293852726-70cdb56c2866', 'Kệ cao chứa hàng thùng trên pallet', [640, 1000, 1400]), text: 'Đồ đạc của bạn luôn an toàn suốt ngày đêm.', sub: 'Cơ sở được giám sát 24/7' },
]
const INTERVAL = 2000

function useSlideshow(count) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => { if (!document.hidden) setI((n) => (n + 1) % count) }, INTERVAL)
    return () => clearInterval(id)
  }, [count])
  return [i, setI]
}

// Ảnh mặt ngoài cơ sở kho làm nền cả trang (mờ nhẹ).
const OUTSIDE = photo('1565891741441-64926e441838', '', [1280, 1920, 2560])

// Nền trôi nhẹ ngược hướng chuột (parallax). Chỉ ghi 2 biến CSS, gộp theo khung hình nên rất nhẹ.
function useParallax() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !window.matchMedia?.('(pointer: fine)').matches) return
    let frame = 0
    const onMove = (e) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
      })
    }
    const onLeave = () => { el.style.setProperty('--px', '0'); el.style.setProperty('--py', '0') }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => { cancelAnimationFrame(frame); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave) }
  }, [])
  return ref
}

/** Bố cục chung cho các trang tài khoản: nền ảnh ngoài kho, một thẻ ở giữa, ảnh tự chuyển bên trái, biểu mẫu bên phải. */
export default function AuthShell({ title, subtitle, children, footer }) {
  const [active, setActive] = useSlideshow(SLIDES.length)
  const slide = SLIDES[active]
  const pageRef = useParallax()

  return (
    <div className="auth-page" ref={pageRef}>
      <div className="auth-page-bg" aria-hidden="true">
        <img src={OUTSIDE.src} srcSet={OUTSIDE.srcSet} sizes="100vw" alt="" />
      </div>
      <div className="auth-topbar">
        <Brand to="/" />
        <Link to="/" className="auth-back"><ArrowLeft size={16} /> Về trang chủ</Link>
      </div>

      <div className="auth-shell">
        <aside className="auth-media" aria-label="Hình ảnh các cơ sở kho của chúng tôi">
          {SLIDES.map((s, n) => (
            <img
              key={s.img.src}
              className={`auth-slide ${n === active ? 'is-active' : ''}`}
              src={s.img.src}
              srcSet={s.img.srcSet}
              sizes="(max-width: 900px) 100vw, 50vw"
              alt={n === active ? s.img.alt : ''}
              aria-hidden={n !== active}
              loading={n === 0 ? 'eager' : 'lazy'}
            />
          ))}
          <div className="auth-media-shade" aria-hidden="true" />
          <div className="auth-quote" aria-live="polite">
            <p key={active}>“{slide.text}”</p>
            <span>{slide.sub}</span>
            <div className="auth-dots" role="tablist" aria-label="Chọn ảnh">
              {SLIDES.map((s, n) => (
                <button
                  key={s.img.src}
                  type="button"
                  role="tab"
                  aria-selected={n === active}
                  aria-label={`Ảnh ${n + 1}`}
                  className={n === active ? 'is-active' : ''}
                  onClick={() => setActive(n)}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="auth-form">
          <div className="auth-form-inner">
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            {children}
            {footer && <div className="auth-footer">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  )
}

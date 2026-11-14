import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import gsap from 'gsap'

// Hiệu ứng chuyển trang "mở kho":
// 1) Bấm link nội bộ → màn tối hiện lên, một căn kho rơi xuống giữa màn hình (cửa cuốn đang đóng).
// 2) Đổi sang trang mới phía sau.
// 3) Cửa cuốn kéo lên → nhìn thấy trang mới qua ô cửa → phóng to xuyên qua cửa để "bật" ra trang.
// Ô cửa là một lỗ thật trong lớp phủ (fill-rule evenodd) nên trang mới hiện thật qua cửa.
// Điều hướng bằng code hoặc nút Back: chỉ có nội dung trồi lên. "Giảm chuyển động": chỉ mờ dần.

// Tốc độ chung của hiệu ứng chuyển trang (1 = gốc, lớn hơn = nhanh hơn).
const SPEED = 1.8
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Ô cửa (đơn vị viewBox): x -85..85, y -10..150. Tâm phóng to đặt ở giữa ô cửa.
const DOOR = { x: -85, y: -10, w: 170, h: 160 }
const ZOOM_ORIGIN = '0 70'
const HOLE = `M${DOOR.x} ${DOOR.y}V${DOOR.y + DOOR.h}H${DOOR.x + DOOR.w}V${DOOR.y}Z`
const SLATS = Array.from({ length: 11 }, (_, i) => DOOR.y + i * (DOOR.h / 11))

function internalTarget(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const a = e.target.closest?.('a[href]')
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return null
  const url = new URL(a.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  if (url.pathname === window.location.pathname) return null
  // Hiệu ứng "ném kho" chỉ chạy khi về trang chủ (mục Home hoặc logo). Trang khác điều hướng bình thường, nội dung chỉ trồi lên.
  if (url.pathname !== "/") return null
  return url.pathname + url.search + url.hash
}

function StorageUnitScene({ refs }) {
  return (
    <svg className="pt-svg" viewBox="-400 -400 800 800" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="pt-door-clip"><rect x={DOOR.x} y={DOOR.y} width={DOOR.w} height={DOOR.h} /></clipPath>
        {/* Mọi thứ trừ ô cửa: để quầng sáng và bóng đổ không phủ màu lên trang mới nhìn qua cửa */}
        <clipPath id="pt-outside-door"><path d={`M-6000 -6000H6000V6000H-6000Z${HOLE}`} clipRule="evenodd" /></clipPath>
        <linearGradient id="pt-slat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F2EC" />
          <stop offset="1" stopColor="#D9D5C9" />
        </linearGradient>
        <radialGradient id="pt-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F5C542" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F5C542" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g ref={refs.scene}>
        {/* Nền tối phủ toàn màn hình, chừa lỗ đúng ô cửa */}
        <path d={`M-6000 -6000H6000V6000H-6000Z${HOLE}`} fill="#0E0E10" fillRule="evenodd" />
        {/* Nút bịt lỗ cửa khi kho đang rơi xuống (lúc đó cửa cuốn chưa nằm khớp lỗ). Bỏ đi khi bắt đầu mở cửa. */}
        <rect ref={refs.plug} x={DOOR.x - 1} y={DOOR.y - 1} width={DOOR.w + 2} height={DOOR.h + 2} fill="#0E0E10" />

        {/* Bóng đổ nằm trên mặt đất, chạy theo kho và co lại khi kho nảy lên cao */}
        <g clipPath="url(#pt-outside-door)">
          <ellipse ref={refs.shadow} cx="0" cy="162" rx="190" ry="12" fill="#000" opacity="0.45" />
          {/* Bụi bay lên mỗi lần kho chạm đất */}
          <ellipse ref={refs.dustL} cx="0" cy="150" rx="0" ry="0" fill="#6B6B73" opacity="0" />
          <ellipse ref={refs.dustR} cx="0" cy="150" rx="0" ry="0" fill="#6B6B73" opacity="0" />
        </g>

        <g ref={refs.unit}>
          <g clipPath="url(#pt-outside-door)">
            <ellipse ref={refs.glow} cx="0" cy="40" rx="330" ry="250" fill="url(#pt-glow)" />
          </g>

          {/* Thân kho (có lỗ cửa) */}
          <path d={`M-150 -60H150V150H-150Z${HOLE}`} fill="#1C1C20" fillRule="evenodd" />
          <path d="M-150 -60H150V-48H-150Z" fill="#26262B" />
          {/* Mái vàng + biển hiệu */}
          <path d="M-172 -56L0 -142L172 -56Z" fill="#F5C542" />
          <path d="M-172 -56L0 -142L172 -56L160 -56L0 -128L-160 -56Z" fill="#E0AE22" />
          <rect x="-62" y="-96" width="124" height="28" rx="6" fill="#0E0E10" />
          <text ref={refs.sign} x="0" y="-77" textAnchor="middle" fill="#F5C542" fontFamily="'Plus Jakarta Sans', Inter, sans-serif" fontWeight="800" fontSize="14" letterSpacing="3">SAFESPACE</text>
          {/* Khung cửa vàng (có lỗ) */}
          <path d={`M-96 -21H96V150H-96Z${HOLE}`} fill="#F5C542" fillRule="evenodd" />
          {/* Đèn báo và bàn phím mở khóa */}
          <rect x="112" y="40" width="22" height="34" rx="4" fill="#2A2A30" />
          <circle ref={refs.led} cx="123" cy="50" r="4" fill="#EF4444" />
          <rect x="116" y="58" width="14" height="10" rx="2" fill="#3A3A42" />
          {/* Mặt đất */}
          <rect x="-220" y="150" width="440" height="4" rx="2" fill="#2A2A30" />

          {/* Cửa cuốn: các lá ngang, kéo lên trong khung cửa */}
          <g clipPath="url(#pt-door-clip)">
            <g ref={refs.door}>
              <rect x={DOOR.x} y={DOOR.y} width={DOOR.w} height={DOOR.h} fill="url(#pt-slat)" />
              {SLATS.map((y) => (
                <g key={y}>
                  <rect x={DOOR.x} y={y} width={DOOR.w} height="2.2" fill="#BDB8AA" />
                  <rect x={DOOR.x} y={y + 2.2} width={DOOR.w} height="1.2" fill="#FFFFFF" opacity="0.7" />
                </g>
              ))}
              <rect x="-22" y="134" width="44" height="7" rx="3.5" fill="#0E0E10" />
            </g>
          </g>
          {/* Trục cuốn phía trên cửa */}
          <rect x="-90" y="-20" width="180" height="10" rx="5" fill="#0E0E10" opacity="0.55" />
        </g>
      </g>
    </svg>
  )
}

export default function PageTransition({ contentSelector = '.site-main' }) {
  const curtain = useRef(null)
  const refs = {
    scene: useRef(null), unit: useRef(null), door: useRef(null), led: useRef(null),
    plug: useRef(null), shadow: useRef(null), glow: useRef(null), sign: useRef(null),
    dustL: useRef(null), dustR: useRef(null),
  }
  const covered = useRef(false)
  const busy = useRef(false)
  const first = useRef(true)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const pending = useRef(null) // timeline đang chạy (ném kho hoặc mở cửa)

  // Kho bị "ném" từ trên cao bên trái: xoay lộn khi bay, đập đất, nảy tưng tưng thấp dần
    // (mỗi lần chạm đất nén bẹp + tung bụi), trượt chậm dần tới giữa màn hình rồi mới sáng đèn.
  // instant: màn tối hiện ngay (dùng khi đã ở trang chủ rồi mới che, vd bấm Back hoặc chuyển hướng sau đăng nhập).
  const playThrowIn = ({ instant = false, onDone }) => {
      const { scene, unit, door, plug, led, shadow, glow, sign, dustL, dustR } = refs
      const X0 = -900 // xuất phát ngoài mép trái
      const START = 0.12
      const FALL = 0.4 // cú bay đầu tiên từ trên cao xuống
      const BOUNCES = [150, 72, 30, 10] // độ cao các lần nảy, thấp dần
      const up = (h) => 0.018 * Math.sqrt(h) // thời gian lên = thời gian xuống, theo căn độ cao như rơi tự do
      const TOTAL = FALL + BOUNCES.reduce((s, h) => s + 2 * up(h), 0)
      const slide = gsap.parseEase('power2.out') // trượt ngang chậm dần như có ma sát
      const xAt = (t) => X0 * (1 - slide(Math.min(1, Math.max(0, (t - START) / TOTAL))))
      const shadowFor = (h) => ({ attr: { rx: 190 * (1 - Math.min(h, 330) / 470) }, opacity: 0.45 * (1 - Math.min(h, 330) / 420) })

      // timeScale > 1: chạy nhanh hơn mà giữ nguyên nhịp nảy (đổi SPEED để chỉnh tốc độ chung).
      const tl = gsap.timeline({ onComplete: onDone }).timeScale(SPEED)
        .set(curtain.current, { autoAlpha: 1, pointerEvents: 'auto' })
        .set(scene.current, { scale: 1, svgOrigin: ZOOM_ORIGIN })
        .set(door.current, { y: 0 })
        .set(plug.current, { opacity: 1 })
        .set(led.current, { attr: { fill: '#EF4444' } })
        .set(glow.current, { opacity: 0 })
        .set(sign.current, { opacity: 0.3 })
        // Gốc biến đổi đặt một lần ở chân kho để xoay/nén quanh mặt đất.
        .set(unit.current, { x: X0, y: -330, rotate: -42, scaleX: 1, scaleY: 1, opacity: 1, svgOrigin: '0 150' })
        .set(shadow.current, { attr: { cx: X0, ...shadowFor(330).attr }, opacity: shadowFor(330).opacity })
        .set([dustL.current, dustR.current], { opacity: 0, attr: { rx: 0, ry: 0 } })
        .fromTo(curtain.current, { opacity: instant ? 1 : 0 }, { opacity: 1, duration: instant ? 0 : 0.22, ease: 'power1.out' })
        // Trượt ngang suốt quá trình nảy (kho và bóng cùng nhịp).
        .to(unit.current, { x: 0, duration: TOTAL, ease: 'power2.out' }, START)
        .to(shadow.current, { attr: { cx: 0 }, duration: TOTAL, ease: 'power2.out' }, START)

      // Va chạm: nén bẹp theo lực, tung 2 cụm bụi sang hai bên.
      const impact = (t, k) => {
        tl.to(unit.current, { scaleY: 1 - k, scaleX: 1 + k * 0.75, duration: 0.05, yoyo: true, repeat: 1, ease: 'power1.out' }, t)
        if (k < 0.06) return
        const x = xAt(t)
        tl.fromTo(dustL.current, { attr: { cx: x - 150, rx: 6, ry: 3 }, opacity: 0.55 * k * 4 },
          { attr: { cx: x - 210, rx: 64 * k * 4, ry: 16 * k * 4 }, opacity: 0, duration: 0.45, ease: 'power2.out' }, t)
          .fromTo(dustR.current, { attr: { cx: x + 150, rx: 6, ry: 3 }, opacity: 0.55 * k * 4 },
            { attr: { cx: x + 210, rx: 64 * k * 4, ry: 16 * k * 4 }, opacity: 0, duration: 0.45, ease: 'power2.out' }, t)
      }

      // Cú bay đầu: rơi từ trên cao, xoay lộn về gần thẳng.
      let t = START
      tl.to(unit.current, { y: 0, duration: FALL, ease: 'power2.in' }, t)
        .to(unit.current, { rotate: 7, duration: FALL, ease: 'power1.out' }, t)
        .to(shadow.current, { ...shadowFor(0), duration: FALL, ease: 'power2.in' }, t)
      t += FALL
      impact(t, 0.22)

      // Các lần nảy thấp dần, nghiêng qua lại nhỏ dần.
      const tilt = [[-8, 4], [-5, 2.5], [-2.5, 1], [-1, 0]]
      const squash = [0.14, 0.09, 0.05, 0.025]
      BOUNCES.forEach((h, i) => {
        const d = up(h)
        tl.to(unit.current, { y: -h, rotate: tilt[i][0], duration: d, ease: 'power2.out' }, t)
          .to(shadow.current, { ...shadowFor(h), duration: d, ease: 'power2.out' }, t)
          .to(unit.current, { y: 0, rotate: tilt[i][1], duration: d, ease: 'power2.in' }, t + d)
          .to(shadow.current, { ...shadowFor(0), duration: d, ease: 'power2.in' }, t + d)
        t += 2 * d
        impact(t, squash[i])
      })

      // Đứng yên giữa màn hình → kho "hiện lên": bật nhẹ, quầng sáng bừng, biển hiệu chớp sáng.
      tl.to(unit.current, { rotate: 0, duration: 0.12, ease: 'power1.out' }, t + 0.1)
        .to(unit.current, { scaleX: 1.04, scaleY: 1.04, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' }, t + 0.18)
        .to(glow.current, { opacity: 1, duration: 0.4, ease: 'power2.out' }, t + 0.18)
        .to(sign.current, { keyframes: { opacity: [0.3, 1, 0.45, 1] }, duration: 0.35, ease: 'none' }, t + 0.2)
      pending.current = tl
      return tl
  }

  // Mở cửa cuốn rồi phóng xuyên qua cửa để lộ trang chủ.
  const playReveal = () => {
    const content = document.querySelector(contentSelector)
    const items = content ? Array.from(content.children) : []
    const tl = gsap.timeline({ onComplete: () => { busy.current = false; pending.current = null } }).timeScale(SPEED)
      .set(curtain.current, { autoAlpha: 1, opacity: 1, pointerEvents: 'auto' })
      .set(refs.led.current, { attr: { fill: '#22C55E' } }, 0.1)
      .set(refs.plug.current, { opacity: 0 }, 0.2)
      .to(refs.door.current, { y: -DOOR.h - 4, duration: 0.5, ease: 'power2.inOut' }, 0.15)
      .to(refs.scene.current, { scale: 16, svgOrigin: ZOOM_ORIGIN, duration: 0.65, ease: 'power3.in' }, 0.55)
      .set(curtain.current, { autoAlpha: 0, pointerEvents: 'none' })
      .set(refs.scene.current, { scale: 1, svgOrigin: ZOOM_ORIGIN })
      .set(refs.door.current, { y: 0 })
    if (items.length) tl.fromTo(items, { scale: 0.96, autoAlpha: 0.6 }, { scale: 1, autoAlpha: 1, duration: 0.9, ease: 'power3.out', clearProps: 'all', transformOrigin: '50% 30%' }, 0.6)
    pending.current = tl
    return tl
  }

  // Bước 1 (bấm link về trang chủ ở bất kỳ trang nào): ném kho che trang cũ trước, rồi mới đổi trang.
  useEffect(() => {
    const onClick = (e) => {
      const to = internalTarget(e)
      if (!to || busy.current || reducedMotion()) return
      e.preventDefault()
      busy.current = true
      playThrowIn({ onDone: () => { covered.current = true; navigate(to) } })
    }
    // Pha "capture" chạy trước Link của React Router nên chặn được điều hướng mặc định.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Bước 3: mở cửa cuốn và phóng xuyên qua cửa. Chạy trước khi trình duyệt vẽ trang mới.
  useLayoutEffect(() => {
    const content = document.querySelector(contentSelector)
    const items = content ? Array.from(content.children) : []

    if (first.current) {
      first.current = false
      if (!reducedMotion()) gsap.fromTo(items, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', clearProps: 'all' })
      return
    }
    if (reducedMotion()) {
      gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, clearProps: 'all' })
      return
    }

    if (covered.current) {
      // Đã che bằng cú ném khi bấm link → giờ chỉ việc mở cửa.
      covered.current = false
      playReveal()
    } else if (pathname === '/') {
      // Tới trang chủ bằng đường khác (nút Back, chuyển hướng sau đăng nhập…): che ngay trước khi trình duyệt vẽ,
      // rồi chạy đủ ném kho → mở cửa.
      pending.current?.kill()
      busy.current = true
      gsap.set(curtain.current, { autoAlpha: 1, opacity: 1, pointerEvents: 'auto' })
      playThrowIn({ instant: true, onDone: playReveal })
    } else {
      gsap.fromTo(items, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out', clearProps: 'all' })
    }
    // Rời trang khi hiệu ứng đang chạy: dừng lại và mở màn ngay để không kẹt màn tối.
    return () => {
      if (!pending.current || covered.current) return
      pending.current.kill(); pending.current = null
      gsap.set(curtain.current, { autoAlpha: 0, pointerEvents: 'none' })
      gsap.set(refs.scene.current, { scale: 1, svgOrigin: ZOOM_ORIGIN })
      busy.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, contentSelector])

  return (
    <div className="pt-curtain" ref={curtain} aria-hidden="true">
      <StorageUnitScene refs={refs} />
    </div>
  )
}

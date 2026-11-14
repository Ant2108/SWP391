import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { KeyRound } from 'lucide-react'

// Cụm kho 3D cho hero: các khối kho có cửa cuốn xếp chồng, lơ lửng nhẹ, nền phát sáng.
// Tối ưu hiệu năng:
//  - Mỗi loại chi tiết (thân, mái, khung, cửa, đèn...) là MỘT InstancedMesh cho mọi khối → ~8 lần vẽ cho cả cảnh.
//  - Texture vẽ bằng canvas một lần, không tải file. Không dùng bóng đổ thời gian thực, không post-processing.
//  - Ngừng vẽ khi hero ra khỏi màn hình; giới hạn DPR; tắt chuyển động khi người dùng chọn "giảm chuyển động".

const YELLOW = '#F5C542'
const W = 1.2, H = 1.0, D = 1.1 // kích thước một khối kho

const PALETTE = {
  light: { body: '#FFFFFF', ambient: 1.3, key: 1.35, glow: 0.55, shadow: 0.28 },
  dark: { body: '#1E1E22', ambient: 0.7, key: 1.1, glow: 0.85, shadow: 0.6 },
}

// Vị trí các khối (đơn vị thế giới). `open`: cửa kéo lên một nửa, bên trong sáng đèn.
const UNITS = [
  { p: [-1.32, 0, 0] }, { p: [0, 0, 0] }, { p: [1.32, 0, 0] },
  { p: [-0.66, 1.12, -0.04] }, { p: [0.66, 1.12, -0.04], open: true },
  { p: [0, 2.24, -0.08] },
  { p: [2.45, 1.75, 0.7], s: 0.62, loose: true }, // khối bay lẻ bên phải
]
// Thùng carton nhỏ trôi quanh cụm kho
const BOXES = [
  { p: [-2.35, 1.55, 0.7], s: 0.3 }, { p: [2.15, -0.35, 1.0], s: 0.24 },
  { p: [-1.95, -0.55, 1.15], s: 0.2 }, { p: [1.25, 3.0, 0.35], s: 0.26 },
]

function canvasTexture(size, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const doorTexture = () => canvasTexture(256, (g, s) => {
  const grad = g.createLinearGradient(0, 0, 0, s)
  grad.addColorStop(0, '#F4F1E8'); grad.addColorStop(1, '#D6D1C2')
  g.fillStyle = grad; g.fillRect(0, 0, s, s)
  for (let y = 0; y < s; y += 22) {
    g.fillStyle = '#B7B1A1'; g.fillRect(0, y, s, 3)
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(0, y + 3, s, 2)
  }
  g.fillStyle = '#16161A'
  if (g.roundRect) { g.beginPath(); g.roundRect(s * 0.38, s - 30, s * 0.24, 12, 6); g.fill() } else g.fillRect(s * 0.38, s - 30, s * 0.24, 12)
})

const radialTexture = (inner, outer) => canvasTexture(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  r.addColorStop(0, inner); r.addColorStop(1, outer)
  g.fillStyle = r; g.fillRect(0, 0, s, s)
})

// Ma trận vị trí của từng chi tiết so với tâm khối.
const local = (x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz))
const PART = {
  body: () => local(0, 0, 0, W, H, D),
  cap: () => local(0, H / 2 + 0.03, 0, W + 0.05, 0.06, D + 0.05),
  frame: () => local(0, -0.04, D / 2 + 0.003, 0.92, 0.84, 1),
  door: (open) => (open ? local(0, 0.205, D / 2 + 0.007, 0.8, 0.26, 1) : local(0, -0.07, D / 2 + 0.007, 0.8, 0.76, 1)),
  strip: () => local(0, -H / 2 - 0.025, 0, W + 0.02, 0.03, D + 0.02),
}

function StorageCluster({ theme, reduced, scrollRef }) {
  const c = PALETTE[theme] || PALETTE.light
  const { viewport, invalidate } = useThree()
  const scale = viewport.width < 6 ? viewport.width / 6.4 : Math.min(1.05, viewport.width / 6.2)

  const refs = { body: useRef(), cap: useRef(), frame: useRef(), door: useRef(), strip: useRef(), inside: useRef(), boxes: useRef(), tape: useRef() }
  const motion = useRef()
  const glow = useRef()
  const pointer = useRef({ x: 0, y: 0 })

  // Tài nguyên tạo một lần cho mỗi lần gắn cảnh, giải phóng khi rời trang.
  const res = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const plane = new THREE.PlaneGeometry(1, 1)
    const door = doorTexture()
    door.anisotropy = 4
    const glowTex = radialTexture('rgba(245,197,66,0.9)', 'rgba(245,197,66,0)')
    const shadowTex = radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)')
    return {
      box, plane, door, glowTex, shadowTex,
      bodyMat: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }),
      yellowMat: new THREE.MeshStandardMaterial({ color: YELLOW, emissive: YELLOW, emissiveIntensity: 0.18, roughness: 0.4, metalness: 0.05 }),
      doorMat: new THREE.MeshStandardMaterial({ map: door, roughness: 0.5 }),
      stripMat: new THREE.MeshBasicMaterial({ color: '#FFCC3D', toneMapped: false }),
      insideMat: new THREE.MeshBasicMaterial({ color: '#FFE08A', toneMapped: false }),
      boxMat: new THREE.MeshStandardMaterial({ color: '#C99E62', roughness: 0.8 }),
      tapeMat: new THREE.MeshStandardMaterial({ color: '#E9D3A6', roughness: 0.7 }),
      glowMat: new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false }),
      shadowMat: new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    }
  }, [])
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose?.()), [res])

  // Đổi màu theo theme mà không tạo lại vật liệu.
  useEffect(() => {
    res.bodyMat.color.set(c.body)
    res.shadowMat.opacity = c.shadow
  }, [c, res])

  // Ma trận cố định của từng chi tiết, tính sẵn.
  const locals = useMemo(() => UNITS.map((u) => ({
    body: PART.body(), cap: PART.cap(), frame: PART.frame(), door: PART.door(u.open), strip: PART.strip(),
  })), [])
  const insideLocal = useMemo(() => local(0, -0.07, D / 2 + 0.004, 0.8, 0.76, 1), [])
  const tapeLocal = useMemo(() => local(0, 0, 0, 1.02, 0.18, 1.02), [])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), out: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() }), [])

  const update = (t) => {
    const { m, out, q, e, v, s } = tmp
    let open = 0
    UNITS.forEach((u, i) => {
      const ph = i * 1.37
      const amp = u.loose ? 0.14 : 0.06
      v.set(u.p[0], u.p[1] + Math.sin(t * 0.9 + ph) * amp, u.p[2])
      e.set(Math.sin(t * 0.6 + ph) * 0.015, (u.loose ? t * 0.25 : Math.sin(t * 0.5 + ph) * 0.04), Math.sin(t * 0.7 + ph) * 0.015)
      q.setFromEuler(e)
      s.setScalar(u.s ?? 1)
      m.compose(v, q, s)
      for (const k of ['body', 'cap', 'frame', 'door', 'strip']) refs[k].current.setMatrixAt(i, out.multiplyMatrices(m, locals[i][k]))
      if (u.open) refs.inside.current.setMatrixAt(open++, out.multiplyMatrices(m, insideLocal))
    })
    BOXES.forEach((b, i) => {
      const ph = i * 2.1
      v.set(b.p[0] + Math.sin(t * 0.4 + ph) * 0.08, b.p[1] + Math.sin(t * 1.1 + ph) * 0.12, b.p[2])
      e.set(t * 0.3 + ph, t * 0.45 + ph, 0)
      q.setFromEuler(e)
      s.setScalar(b.s)
      m.compose(v, q, s)
      refs.boxes.current.setMatrixAt(i, m)
      refs.tape.current.setMatrixAt(i, out.multiplyMatrices(m, tapeLocal))
    })
    for (const k of Object.keys(refs)) refs[k].current.instanceMatrix.needsUpdate = true
  }

  // Lần đầu (và khi giảm chuyển động) đặt vị trí tĩnh.
  useEffect(() => { update(0); invalidate() }) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduced) return
    const onMove = (ev) => {
      pointer.current.x = (ev.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (ev.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduced])

  useFrame((state, dt) => {
    if (reduced) return
    const t = state.clock.elapsedTime
    update(t)
    const g = motion.current
    const p = pointer.current
    const s = scrollRef?.current ?? 0
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, p.y * 0.08 + s * 0.35, 3, dt)
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, p.x * 0.22 - s * 0.4, 3, dt)
    g.position.y = THREE.MathUtils.damp(g.position.y, s * 1.1, 3, dt)
    // Nền phát sáng "thở" chậm.
    glow.current.material.opacity = c.glow * (0.82 + Math.sin(t * 1.2) * 0.18)
  })

  const n = UNITS.length
  return (
    <>
      <ambientLight intensity={c.ambient} />
      <directionalLight position={[3, 5, 9]} intensity={c.key} />
      <directionalLight position={[-5, 1, 3]} intensity={0.35} color="#FFE3A0" />

      <group scale={scale}>
        {/* Quầng sáng phía sau cụm kho */}
        <mesh ref={glow} geometry={res.plane} material={res.glowMat} position={[0.1, 0.25, -3]} scale={[9, 7.5, 1]} />

        <group ref={motion}>
          <group rotation={[0.36, 0, 0]} position={[0, -1.05, 0]}>
            <group rotation={[0, -0.58, 0]}>
              {/* Bóng mềm tĩnh dưới chân (thay cho bóng đổ thời gian thực) */}
              <mesh geometry={res.plane} material={res.shadowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0.1]} scale={[5.6, 3.8, 1]} />

              <instancedMesh ref={refs.body} args={[res.box, res.bodyMat, n]} />
              <instancedMesh ref={refs.cap} args={[res.box, res.yellowMat, n]} />
              <instancedMesh ref={refs.frame} args={[res.plane, res.yellowMat, n]} />
              <instancedMesh ref={refs.inside} args={[res.plane, res.insideMat, UNITS.filter((u) => u.open).length]} />
              <instancedMesh ref={refs.door} args={[res.plane, res.doorMat, n]} />
              <instancedMesh ref={refs.strip} args={[res.box, res.stripMat, n]} />
              <instancedMesh ref={refs.boxes} args={[res.box, res.boxMat, BOXES.length]} />
              <instancedMesh ref={refs.tape} args={[res.box, res.tapeMat, BOXES.length]} />

              <Html position={[1.55, 2.75, 0.6]} center zIndexRange={[20, 0]}>
                <div className="hd-card">
                  <span className="hd-icon"><KeyRound size={17} /></span>
                  <div><small>Ô B-12 · Vừa</small><strong>Vừa được mở khóa</strong></div>
                  <span className="hd-dot" />
                </div>
              </Html>
              <Html position={[-1.75, -0.35, 0.9]} center zIndexRange={[20, 0]}>
                <div className="hd-card">
                  <span className="hd-ring" />
                  <div><small>Tỷ lệ sử dụng · Quận 1</small><strong>86% đã thuê</strong></div>
                </div>
              </Html>
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

class GLBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function HeroFallback() {
  return (
    <div className="lp-visual-fallback">
      <img
        src="https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&q=75&auto=format&fit=crop"
        alt="Lối đi trong kho với kệ chứa nhiều thùng hàng"
        loading="eager"
      />
    </div>
  )
}

export default function HeroStorage3D({ theme = 'light', scrollRef }) {
  const wrap = useRef(null)
  const [visible, setVisible] = useState(true)
  const [supported] = useState(hasWebGL)
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Ngừng vẽ khi hero ra khỏi màn hình hoặc tab bị ẩn.
  useEffect(() => {
    const el = wrap.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (!supported) return <HeroFallback />

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
      <GLBoundary fallback={<HeroFallback />}>
        <Canvas
          flat
          dpr={[1, 1.5]}
          frameloop={visible && !reduced ? 'always' : 'demand'}
          camera={{ position: [0, 0, 10], fov: 30 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false }}
          style={{ background: 'transparent' }}
        >
          <StorageCluster theme={theme} reduced={reduced} scrollRef={scrollRef} />
        </Canvas>
      </GLBoundary>
    </div>
  )
}

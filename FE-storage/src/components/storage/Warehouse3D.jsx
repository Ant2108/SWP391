import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import gsap from 'gsap'
import { Boxes, Eye, Layers, RotateCcw, ArrowRight, Lock, ShieldCheck, Ruler, User, Package } from 'lucide-react'
import { api } from '../../api/client.js'
import { sizeBucket } from '../../utils/unitFilter.js'
import { money as vnd, unitTypeLabel } from '../../utils/format.js'
import { monthlyRate, pickRule } from '../../utils/pricing.js'

/* =========================================================
   Mô hình 3D các CỠ KHO của một cơ sở: mỗi loại kho có một kho mẫu, đúng tỉ lệ kích thước thật.
   Khách chỉ chọn CỠ kho; ô kho cụ thể do quản lý cơ sở gán sau khi đặt chỗ.
   Bấm một kho: cửa cuốn mở, bên trong hiện người cao 1,7 m và hàng hóa mô phỏng (thùng, sofa, tủ, giường...)
   đặt đúng kích thước thật để khách hình dung kho chứa được bao nhiêu.
   ========================================================= */

const K = 1.1 // 1 mét ngoài đời = 1.1 đơn vị trong cảnh (đồng nhất cho kho, người và hàng hóa)
const GAP = 2.2
const PERSON_H = 1.7

const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1))
const money = (n) => `${vnd(n)} / tháng`

// Đồ vật mô phỏng (kích thước thật, đơn vị mét)
const CATALOG = {
  box: { name: 'thùng carton (50×40×40 cm)', w: 0.5, h: 0.4, l: 0.4, color: '#C98A12' },
  suitcase: { name: 'vali', w: 0.5, h: 0.7, l: 0.3, color: '#7C3AED' },
  sofa: { name: 'ghế sofa 3 chỗ', w: 2.0, h: 0.85, l: 0.9, color: '#2F6FB0' },
  bed: { name: 'nệm đôi', w: 1.6, h: 0.3, l: 2.0, color: '#E5E7EB' },
  wardrobe: { name: 'tủ quần áo', w: 1.2, h: 2.0, l: 0.6, color: '#8B5A2B' },
  fridge: { name: 'tủ lạnh', w: 0.7, h: 1.8, l: 0.7, color: '#D1D5DB' },
  washer: { name: 'máy giặt', w: 0.6, h: 0.85, l: 0.6, color: '#F3F4F6' },
  table: { name: 'bàn ăn', w: 1.6, h: 0.75, l: 0.9, color: '#A0764A' },
  pallet: { name: 'pallet hàng hóa', w: 1.2, h: 1.2, l: 1.0, color: '#B7791F' },
  rack: { name: 'kệ hàng', w: 2.4, h: 2.2, l: 0.6, color: '#4B5563' },
}
const PLANS = {
  S: [['suitcase', 2], ['box', 14]],
  M: [['sofa', 1], ['bed', 1], ['wardrobe', 1], ['box', 18]],
  L: [['sofa', 1], ['bed', 2], ['wardrobe', 2], ['fridge', 1], ['washer', 1], ['table', 1], ['box', 36]],
  XL: [['rack', 2], ['pallet', 8], ['box', 24]],
}

/** Mỗi loại kho đang hoạt động (có số đo) thành một kho mẫu; tính số ô còn trống của loại đó. */
function buildSamples(types, units, prices, fid) {
  const usable = (types || [])
    .filter((t) => t.active && t.width != null && t.length != null)
    .sort((a, b) => Number(a.width) * Number(a.length) - Number(b.width) * Number(b.length))
  const priceOf = (typeId) => monthlyRate(pickRule(prices || [], 'RENTAL', Number(fid), typeId))
  const items = []
  for (const t of usable) {
    const mine = (units || []).filter((u) => u.unitTypeId === t.id)
    if (!mine.length) continue
    const w = Number(t.width)
    const l = Number(t.length)
    const h = Number(t.height) || 2.5
    const rate = priceOf(t.id)
    items.push({
      typeId: t.id,
      name: unitTypeLabel(t.typeName),
      bucket: sizeBucket(t) || 'M',
      real: { w, l, h },
      dims: [w * K, h * K, l * K],
      area: w * l,
      price: rate != null ? Number(rate) : null,
      free: mine.filter((u) => u.status === 'AVAILABLE').length,
      total: mine.length,
      about: t.description || t.sizeDescription || '',
    })
  }
  const rowWidth = items.reduce((s, i) => s + i.dims[0], 0) + GAP * Math.max(0, items.length - 1)
  let x = -rowWidth / 2
  for (const it of items) {
    it.pos = [x + it.dims[0] / 2, 0, -it.dims[2] / 2] // cửa ở z = 0, quay về phía người xem
    x += it.dims[0] + GAP
  }
  return { items, rowWidth, maxDepth: items.reduce((m, i) => Math.max(m, i.dims[2]), 0) }
}

function doorTexture(it) {
  const W = 512
  const H = Math.round((512 * (it.dims[1] - 0.34)) / (it.dims[0] - 0.2))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#F5C542'
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(0,0,0,0.13)'
  for (let y = 10; y < H; y += 22) g.fillRect(0, y, W, 3)
  const pw = W * 0.8
  const ph = H * 0.72
  const px = (W - pw) / 2
  const py = (H - ph) / 2
  g.fillStyle = 'rgba(12,16,26,0.92)'
  g.strokeStyle = '#F9B800'
  g.lineWidth = 6
  g.beginPath()
  g.roundRect(px, py, pw, ph, 26)
  g.fill()
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#F9B800'
  g.font = `800 ${Math.round(ph * 0.42)}px Inter, Arial, sans-serif`
  g.fillText(it.bucket, W / 2, py + ph * 0.3)
  g.fillStyle = '#FFFFFF'
  g.font = `700 ${Math.round(ph * 0.12)}px Inter, Arial, sans-serif`
  g.fillText(it.name, W / 2, py + ph * 0.58)
  g.fillStyle = '#CBD5E1'
  g.font = `600 ${Math.round(ph * 0.085)}px Inter, Arial, sans-serif`
  g.fillText(`${fmt(it.real.w)} × ${fmt(it.real.l)} × ${fmt(it.real.h)} m  ·  ${fmt(it.area)} m²`, W / 2, py + ph * 0.74)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function floorLabel(it) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 200
  const g = c.getContext('2d')
  const ok = it.free > 0
  const col = ok ? '#4ADE80' : '#94A3B8'
  g.fillStyle = 'rgba(9,13,22,0.82)'
  g.beginPath()
  g.roundRect(6, 6, 500, 188, 24)
  g.fill()
  g.strokeStyle = col
  g.lineWidth = 5
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#FFFFFF'
  g.font = '800 54px Inter, Arial, sans-serif'
  g.fillText(it.name, 256, 52)
  g.fillStyle = '#CBD5E1'
  g.font = '600 34px Inter, Arial, sans-serif'
  g.fillText(`${fmt(it.area)} m² · cao ${fmt(it.real.h)} m`, 256, 106)
  g.fillStyle = col
  g.font = '700 36px Inter, Arial, sans-serif'
  g.fillText(ok ? `Còn ${it.free}/${it.total} ô trống` : 'Hiện đã hết chỗ', 256, 156)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function textSprite(text, color = '#FFFFFF') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(12,12,14,0.85)'
  g.beginPath()
  g.roundRect(4, 4, 504, 88, 22)
  g.fill()
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 40px Inter, Arial, sans-serif'
  g.fillText(text, 256, 50)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.renderOrder = 10
  return sp
}

const addBox = (group, w, h, l, color, x, y, z, edge = '#1A1205') => {
  const geo = new THREE.BoxGeometry(w, h, l)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.65 }))
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.6 })))
  group.add(mesh)
  return mesh
}

/** Hàng hóa mô phỏng + người, đặt đúng kích thước thật (mét) trong kho; trả về nhóm 3D và danh sách mô tả. */
function buildContents(it) {
  const { w, l, h } = it.real
  const group = new THREE.Group()
  const placed = {}
  const zFrontLimit = l / 2 - 1.5 // chừa lối đi gần cửa cho người đứng
  let rowX = -w / 2 + 0.12
  let rowZ = -l / 2 + 0.1
  let rowDepth = 0
  const tryPlace = (iw, il) => {
    if (rowX + iw > w / 2 - 0.1) {
      rowX = -w / 2 + 0.12
      rowZ += rowDepth + 0.06
      rowDepth = 0
    }
    if (rowZ + il > zFrontLimit) return null
    const pos = [rowX + iw / 2, rowZ + il / 2]
    rowX += iw + 0.05
    rowDepth = Math.max(rowDepth, il)
    return pos
  }
  const note = (key, n = 1) => { placed[key] = (placed[key] || 0) + n }

  for (const [key, count] of PLANS[it.bucket] || PLANS.M) {
    const c = CATALOG[key]
    if (key === 'box') {
      const levels = Math.max(1, Math.min(3, Math.floor((h - 0.2) / c.h)))
      for (let i = 0; i < Math.ceil(count / levels); i++) {
        const p = tryPlace(c.w, c.l)
        if (!p) break
        for (let lv = 0; lv < levels; lv++) {
          addBox(group, c.w, c.h, c.l, c.color, p[0], lv * c.h, p[1])
          note('box')
        }
      }
      continue
    }
    for (let i = 0; i < count; i++) {
      const p = tryPlace(c.w, c.l)
      if (!p) break
      if (key === 'sofa') {
        addBox(group, c.w, 0.45, c.l, c.color, p[0], 0, p[1])
        addBox(group, c.w, 0.4, 0.22, '#27598F', p[0], 0.45, p[1] - c.l / 2 + 0.11)
      } else if (key === 'pallet') {
        addBox(group, c.w, 0.14, c.l, '#7C4A12', p[0], 0, p[1])
        addBox(group, c.w - 0.1, c.h - 0.14, c.l - 0.1, c.color, p[0], 0.14, p[1])
      } else if (key === 'rack') {
        addBox(group, c.w, 0.05, c.l, c.color, p[0], 0, p[1])
        ;[0.7, 1.4, 2.1].forEach((y) => addBox(group, c.w, 0.05, c.l, c.color, p[0], y, p[1]))
        for (let s = 0; s < 3; s++) addBox(group, 0.6, 0.4, 0.4, '#C98A12', p[0] - 0.8 + s * 0.8, 0.75 + (s % 2) * 0.7, p[1])
      } else {
        addBox(group, c.w, c.h, c.l, c.color, p[0], 0, p[1])
      }
      note(key)
    }
  }

  // Người cao 1,7 m đứng gần cửa
  const skin = new THREE.MeshStandardMaterial({ color: '#E5E7EB', roughness: 0.7 })
  const person = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, PERSON_H - 0.4 - 0.28, 4, 10), skin)
  body.position.y = (PERSON_H - 0.28) / 2
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin)
  head.position.y = PERSON_H - 0.14
  person.add(body, head)
  person.position.set(-w / 2 + 0.6, 0, l / 2 - 0.6)
  person.traverse((o) => { o.castShadow = true })
  group.add(person)

  const label = textSprite('Người cao 1,7 m', '#F9B800')
  label.scale.set(1.7 / K, (1.7 / K) * 0.1875, 1)
  label.position.set(person.position.x, PERSON_H + 0.45, person.position.z)
  group.add(label)

  const summary = Object.entries(placed).map(([k, n]) => `${n} × ${CATALOG[k].name}`)
  return { group, summary }
}

/* ---------- Thành phần chính ---------- */
export default function Warehouse3D({ facilityId, facilities = [] }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const sceneRef = useRef({})
  const unitsRef = useRef([]) // { it, group, hit, walls[], ceiling, door, light, contents, open }
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2(-9, -9))
  const openRef = useRef(null)

  const [fid, setFid] = useState(facilityId || facilities[0]?.id || 1)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState([])
  const [hovered, setHovered] = useState(null)
  const [cameraMode, setCameraMode] = useState('ISO')
  const [webGLError, setWebGLError] = useState(false)

  useEffect(() => {
    if (facilityId) setFid(facilityId)
  }, [facilityId])

  useEffect(() => {
    let alive = true
    setData(null)
    setSelected(null)
    setLoadError('')
    Promise.all([
      api.unitTypes.listByFacility(fid),
      api.storageUnits.search({ facilityId: fid }),
      api.priceRules.list().catch(() => []),
    ])
      .then(([types, units, prices]) => {
        if (alive) setData(buildSamples(types, units, prices, fid))
      })
      .catch((e) => {
        if (alive) setLoadError(e.message || 'Không tải được các cỡ kho')
      })
    return () => {
      alive = false
    }
  }, [fid])

  const facilityName = useMemo(() => facilities.find((f) => f.id === Number(fid))?.name || 'Cơ sở kho', [facilities, fid])

  const viewFor = useCallback(
    (mode) => {
      const aspect = containerRef.current ? containerRef.current.clientWidth / containerRef.current.clientHeight : 1.8
      const tanH = Math.tan((38 / 2) * (Math.PI / 180))
      const rw = data?.rowWidth || 20
      const d = Math.max(22, ((rw / 2 + 3) / (tanH * Math.min(aspect, 2.4))) * 0.95)
      if (mode === 'TOP') return { pos: [0, d * 1.2, 0.1], target: [0, 0, -(data?.maxDepth || 6) / 2] }
      if (mode === 'FRONT') return { pos: [0, 2.6, d * 0.7], target: [0, 2.0, -3] }
      return { pos: [0, d * 0.38, d * 0.95], target: [0, 1.2, -(data?.maxDepth || 6) * 0.3] }
    },
    [data]
  )

  const flyTo = useCallback(
    (view, animate = true) => {
      const { camera, controls } = sceneRef.current
      if (!camera || !controls) return
      if (!animate) {
        camera.position.set(...view.pos)
        controls.target.set(...view.target)
        return
      }
      gsap.to(camera.position, { x: view.pos[0], y: view.pos[1], z: view.pos[2], duration: 1.1, ease: 'power3.inOut' })
      gsap.to(controls.target, { x: view.target[0], y: view.target[1], z: view.target[2], duration: 1.1, ease: 'power3.inOut' })
    },
    []
  )

  // Dựng cảnh 3D
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas || !data || !data.items.length) return undefined
    try {
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#151515')
      scene.fog = new THREE.FogExp2('#151515', 0.01)
      const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 300)
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      const controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.maxPolarAngle = Math.PI / 2 - 0.03
      controls.minDistance = 5
      controls.maxDistance = 140
      sceneRef.current = { scene, camera, renderer, controls }

      scene.add(new THREE.AmbientLight('#B5B5B5', 1.0))
      const sun = new THREE.DirectionalLight('#FFF9E9', 1.8)
      sun.position.set(14, 30, 24)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, far: 100 })
      scene.add(sun)
      const fill = new THREE.DirectionalLight('#38BDF8', 0.4)
      fill.position.set(-12, 10, -10)
      scene.add(fill)

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 48), new THREE.MeshStandardMaterial({ color: '#1A1A1A', roughness: 0.4, metalness: 0.2 }))
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      scene.add(floor)
      const grid = new THREE.GridHelper(70, 70, '#F5C542', '#2E2E2E')
      grid.position.y = 0.01
      scene.add(grid)

      const frameMat = new THREE.MeshStandardMaterial({ color: '#262626', roughness: 0.4, metalness: 0.7 })
      unitsRef.current = []
      data.items.forEach((it) => {
        const [uw, uh, ud] = it.dims
        const g = new THREE.Group()
        g.position.set(...it.pos)

        const mkWall = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, transparent: true })
        const walls = [mkWall('#566070'), mkWall('#566070'), mkWall('#4A5362')]
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, uh, ud), walls[0])
        left.position.set(-uw / 2, uh / 2, 0)
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, uh, ud), walls[1])
        right.position.set(uw / 2, uh / 2, 0)
        const back = new THREE.Mesh(new THREE.BoxGeometry(uw, uh, 0.08), walls[2])
        back.position.set(0, uh / 2, -ud / 2)
        const ceilMat = new THREE.MeshStandardMaterial({ color: '#262626', roughness: 0.4, metalness: 0.7, transparent: true })
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(uw + 0.12, 0.08, ud + 0.12), ceilMat)
        ceiling.position.set(0, uh, 0)
        const inFloor = new THREE.Mesh(new THREE.BoxGeometry(uw - 0.08, 0.04, ud), new THREE.MeshStandardMaterial({ color: '#3B424D', roughness: 0.8 }))
        inFloor.position.set(0, 0.02, 0)
        ;[left, right, back, ceiling].forEach((m) => { m.castShadow = true; m.receiveShadow = true })
        g.add(left, right, back, ceiling, inFloor)

        // hộp cuộn cửa + đèn báo còn chỗ
        const shutterMat = frameMat.clone()
        shutterMat.transparent = true
        const shutterBox = new THREE.Mesh(new THREE.BoxGeometry(uw - 0.1, 0.3, 0.25), shutterMat)
        shutterBox.position.set(0, uh - 0.16, ud / 2)
        g.add(shutterBox)
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), new THREE.MeshBasicMaterial({ color: it.free > 0 ? '#22C55E' : '#EF4444' }))
        led.position.set(uw / 2 - 0.45, uh - 0.16, ud / 2 + 0.14)
        g.add(led)

        // cửa cuốn có bảng ký hiệu loại kho
        const doorW = uw - 0.2
        const doorH = uh - 0.34
        const doorGroup = new THREE.Group()
        doorGroup.position.set(0, doorH / 2, ud / 2)
        const tex = doorTexture(it)
        const sideMat = new THREE.MeshStandardMaterial({ color: '#F5C542', roughness: 0.4, metalness: 0.4 })
        const frontMat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.2 })
        const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.05), [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat])
        doorGroup.add(door)
        g.add(doorGroup)

        const light = new THREE.PointLight('#FFF4D6', 0.2, 18)
        light.position.set(0, uh - 0.4, 0)
        g.add(light)

        // nhãn trên sàn
        const lw = Math.max(5, uw)
        const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw * 0.39), new THREE.MeshBasicMaterial({ map: floorLabel(it), transparent: true }))
        label.rotation.x = -Math.PI / 2
        label.position.set(0, 0.03, ud / 2 + 1.7)
        g.add(label)

        const hit = new THREE.Mesh(new THREE.BoxGeometry(uw, uh, ud), new THREE.MeshBasicMaterial({ visible: false }))
        hit.position.set(0, uh / 2, 0)
        hit.userData = { index: unitsRef.current.length }
        g.add(hit)

        scene.add(g)
        unitsRef.current.push({ it, group: g, hit, walls, ceilMat, shutterMat, doorGroup, doorH, light, contents: null, summary: [] })
      })

      const v = viewFor('ISO')
      camera.position.set(...v.pos)
      controls.target.set(...v.target)

      let raf
      const loop = () => {
        raf = requestAnimationFrame(loop)
        controls.update()
        renderer.render(scene, camera)
      }
      loop()
      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight)
      }
      window.addEventListener('resize', onResize)
      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        gsap.killTweensOf(camera.position)
        gsap.killTweensOf(controls.target)
        controls.dispose()
        renderer.dispose()
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose() })
        })
        unitsRef.current = []
        openRef.current = null
      }
    } catch (err) {
      console.warn('Không khởi tạo được WebGL:', err)
      setWebGLError(true)
      return undefined
    }
  }, [data, viewFor])

  const closeUnit = useCallback((u) => {
    if (!u) return
    u.doorGroup.visible = true
    gsap.to(u.doorGroup.position, { y: u.doorH / 2, duration: 0.6, ease: 'power2.out' })
    gsap.to(u.doorGroup.scale, { y: 1, duration: 0.6, ease: 'power2.out' })
    gsap.to(u.shutterMat, { opacity: 1, duration: 0.4 })
    gsap.to(u.light, { intensity: 0.2, duration: 0.3 })
    u.walls.forEach((m) => gsap.to(m, { opacity: 1, duration: 0.4 }))
    gsap.to(u.ceilMat, { opacity: 1, duration: 0.4 })
    if (u.contents) u.contents.visible = false
  }, [])

  const openUnit = useCallback(
    (u) => {
      const prev = openRef.current
      if (prev && prev !== u) closeUnit(prev)
      openRef.current = u
      const [uw, uh, ud] = u.it.dims

      if (!u.contents) {
        const built = buildContents(u.it)
        built.group.scale.setScalar(K)
        u.group.add(built.group)
        u.contents = built.group
        u.summary = built.summary
      }
      u.contents.visible = true
      u.contents.scale.set(K, 0.01, K)
      gsap.to(u.contents.scale, { y: K, duration: 0.7, ease: 'back.out(1.4)', delay: 0.25 })

      gsap.to(u.doorGroup.position, { y: u.doorH / 2 + u.doorH * 0.88, duration: 0.8, ease: 'power2.inOut' })
      gsap.to(u.doorGroup.scale, { y: 0.12, duration: 0.8, ease: 'power2.inOut', onComplete: () => { if (openRef.current === u) u.doorGroup.visible = false } })
      gsap.to(u.shutterMat, { opacity: 0, duration: 0.6 })
      gsap.to(u.light, { intensity: 7, duration: 0.5 })
      u.walls.forEach((m) => gsap.to(m, { opacity: 0.22, duration: 0.5 }))
      gsap.to(u.ceilMat, { opacity: 0, duration: 0.5 })

      setSelected(u.it)
      setSummary(u.summary)

      const { camera, controls } = sceneRef.current
      if (camera && controls) {
        const dist = Math.max(12, uw * 2.0) + ud * 0.25
        const shift = Math.max(2.5, uw * 0.45) // đẩy kho sang trái, chừa chỗ cho bảng thông tin bên phải
        gsap.to(camera.position, { x: u.it.pos[0] + shift * 0.4, y: uh + 8 + ud * 0.3, z: dist * 0.92, duration: 1.2, ease: 'power3.out' })
        gsap.to(controls.target, { x: u.it.pos[0] + shift, y: uh * 0.2, z: -ud * 0.4, duration: 1.2, ease: 'power3.out' })
      }
    },
    [closeUnit]
  )

  const pick = (e) => {
    const container = containerRef.current
    const { camera } = sceneRef.current
    if (!container || !camera) return null
    const rect = container.getBoundingClientRect()
    mouse.current.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.current.setFromCamera(mouse.current, camera)
    const hit = raycaster.current.intersectObjects(unitsRef.current.map((u) => u.hit), false)[0]
    return hit ? unitsRef.current[hit.object.userData.index] : null
  }

  const onMove = (e) => {
    const u = pick(e)
    setHovered(u ? u.it : null)
    if (containerRef.current) containerRef.current.style.cursor = u ? 'pointer' : 'grab'
  }
  const onClick = (e) => {
    const u = pick(e)
    if (u) openUnit(u)
  }

  const closePanel = useCallback(() => {
    closeUnit(openRef.current)
    openRef.current = null
    setSelected(null)
    flyTo(viewFor(cameraMode))
  }, [closeUnit, flyTo, viewFor, cameraMode])

  const changeView = (mode) => {
    setCameraMode(mode)
    if (openRef.current) {
      closeUnit(openRef.current)
      openRef.current = null
      setSelected(null)
    }
    flyTo(viewFor(mode))
  }

  const focusType = (typeId) => {
    const u = unitsRef.current.find((x) => x.it.typeId === typeId)
    if (u) openUnit(u)
  }

  if (webGLError) {
    return (
      <div className="warehouse-3d-wrapper warehouse-3d-fallback">
        <div className="fallback-inner">
          <Boxes size={48} color="#F5C542" />
          <h3>Hướng dẫn chọn cỡ kho (chế độ 2D)</h3>
          <p>Thiết bị này không hỗ trợ WebGL. Bạn có thể xem các cỡ kho ở bảng giá bên dưới.</p>
        </div>
      </div>
    )
  }

  const fits = selected ? Math.floor(selected.real.w / 0.5) * Math.floor(selected.real.l / 0.4) * Math.floor(selected.real.h / 0.4) : 0
  const chooseUrl = selected ? `/checkout?facility=${fid}&unitType=${selected.typeId}` : '#'

  return (
    <div className="warehouse-3d-wrapper" ref={containerRef}>
      <canvas ref={canvasRef} className="warehouse-3d-canvas" onMouseMove={onMove} onClick={onClick} />

      {!data && !loadError && <div className="wh-center-msg">Đang tải các cỡ kho…</div>}
      {loadError && <div className="wh-center-msg">Không tải được các cỡ kho: {loadError}</div>}
      {data && !data.items.length && <div className="wh-center-msg">Cơ sở này chưa có cỡ kho nào được mở bán.</div>}

      <div className="warehouse-top-bar">
        <div className="warehouse-status-badge">
          <span className="live-dot" />
          {facilities.length > 1 ? (
            <select className="wh-select" value={fid} onChange={(e) => setFid(Number(e.target.value))} aria-label="Chọn cơ sở">
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <span>{facilityName}</span>
          )}
          <span className="live-pill">{data ? `${data.items.length} cỡ kho` : '…'}</span>
        </div>
        <div className="warehouse-view-modes">
          <button type="button" className={`view-mode-btn ${cameraMode === 'ISO' ? 'active' : ''}`} onClick={() => changeView('ISO')}>
            <Layers size={14} /> Tổng quan
          </button>
          <button type="button" className={`view-mode-btn ${cameraMode === 'FRONT' ? 'active' : ''}`} onClick={() => changeView('FRONT')}>
            <Eye size={14} /> Chính diện
          </button>
          <button type="button" className={`view-mode-btn ${cameraMode === 'TOP' ? 'active' : ''}`} onClick={() => changeView('TOP')}>
            <RotateCcw size={14} /> Nhìn từ trên
          </button>
        </div>
      </div>

      <div className="warehouse-filter-bar">
        <span className="filter-label">Xem nhanh cỡ kho:</span>
        {(data?.items || []).map((it) => (
          <button key={it.typeId} type="button" className={`filter-pill ${selected?.typeId === it.typeId ? 'active' : ''}`} onClick={() => focusType(it.typeId)}>
            {it.name} · {fmt(it.area)} m²
          </button>
        ))}
        <span className="wh-legend">
          <i className="status-dot" style={{ background: '#22C55E' }} /> còn ô trống
          <i className="status-dot" style={{ background: '#EF4444', marginLeft: 10 }} /> đã hết chỗ
        </span>
      </div>

      {hovered && !selected && (
        <div className="warehouse-hover-tooltip">
          <div className="tooltip-head"><strong>{hovered.name}</strong></div>
          <div className="tooltip-meta">{fmt(hovered.real.w)} × {fmt(hovered.real.l)} × {fmt(hovered.real.h)} m · {fmt(hovered.area)} m²</div>
          <div className="tooltip-hint">Bấm để mở cửa và xem đồ có thể chứa bên trong</div>
        </div>
      )}

      {selected && (
        <div className="warehouse-unit-hud wh-hud">
          <div className="hud-header">
            <div>
              <div className="hud-eyebrow">CỠ KHO {selected.bucket}</div>
              <h3 className="hud-title">{selected.name} · {fmt(selected.area)} m²</h3>
            </div>
            <button type="button" className="hud-close-btn" onClick={closePanel} aria-label="Đóng chi tiết">✕</button>
          </div>

          <div className="hud-perks" style={{ marginBottom: 10 }}>
            <div className="perk-tag">
              <i className="status-dot" style={{ background: selected.free > 0 ? '#22C55E' : '#EF4444' }} />
              <strong>{selected.free > 0 ? `Còn ${selected.free}/${selected.total} ô trống` : 'Hiện đã hết chỗ'}</strong>
            </div>
            <div className="perk-tag"><ShieldCheck size={14} /> Camera 24/7</div>
            <div className="perk-tag"><Lock size={14} /> Khóa mã thông minh</div>
          </div>

          <div className="hud-stats-grid">
            <div className="hud-stat-box">
              <span className="hud-stat-label">Kích thước (R × D × C)</span>
              <strong className="hud-stat-val">{fmt(selected.real.w)} × {fmt(selected.real.l)} × {fmt(selected.real.h)} m</strong>
            </div>
            <div className="hud-stat-box">
              <span className="hud-stat-label">Diện tích / thể tích</span>
              <strong className="hud-stat-val">{fmt(selected.area)} m² · {fmt(selected.area * selected.real.h)} m³</strong>
            </div>
            <div className="hud-stat-box highlight" style={{ gridColumn: '1 / -1' }}>
              <span className="hud-stat-label">Giá thuê</span>
              <strong className="hud-stat-val">{selected.price ? money(selected.price) : 'Xem bảng giá'}</strong>
            </div>
          </div>

          <div className="compare-wrap">
            <div className="compare-head">
              <strong><Ruler size={15} /> Đồ chứa được bên trong</strong>
            </div>
            <p className="compare-note" style={{ marginTop: 0 }}>
              Kho được mở ra đúng tỉ lệ. <User size={13} style={{ verticalAlign: -2 }} /> Người trong mô hình cao 1,7 m và đồ đạc dùng kích thước thật.
            </p>
            <ul className="compare-list">
              <li><User size={14} /> 1 người, cao 1,7 m</li>
              {summary.map((s) => (
                <li key={s}><Package size={14} /> {s}</li>
              ))}
            </ul>
            <p className="compare-note">
              Khi để trống, cỡ kho này chứa khoảng <strong>{fits.toLocaleString('vi-VN')}</strong> thùng carton tiêu chuẩn (50 × 40 × 40 cm) xếp sát trần.
            </p>
          </div>

          {selected.about && <p className="hud-desc"><strong>Phù hợp để:</strong> {selected.about}</p>}
          <p className="hud-desc" style={{ marginBottom: 26 }}>Bạn chọn cỡ kho; quản lý cơ sở sẽ gán ô kho cụ thể sau khi bạn đặt chỗ.</p>

          <div className="hud-actions">
            {selected.free > 0 ? (
              <a href={chooseUrl} className="hud-book-btn">
                Đặt kho {selected.name.toLowerCase()} <ArrowRight size={16} />
              </a>
            ) : (
              <button type="button" className="hud-book-btn disabled" disabled title="Các ô kho cỡ này hiện đã được đặt hết">
                Hiện không còn ô kho cỡ này
              </button>
            )}
            <button type="button" className="hud-close-action" onClick={closePanel}>Đóng</button>
          </div>
        </div>
      )}

      {!selected && (
        <div className="warehouse-instructions"><span>🖱️ Kéo để xoay · Lăn chuột để phóng to · Bấm vào một cỡ kho để mở cửa</span></div>
      )}
    </div>
  )
}

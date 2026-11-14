import { useEffect, useRef, useState } from 'react'
import { Eraser, PenTool } from 'lucide-react'
import { Button, Input } from './ui.jsx'
import { api } from '../api/client.js'
import { useToast } from '../hooks/useToast.jsx'

/**
 * Nhân viên / quản lý ký hộ tại quầy: khách đến gặp trực tiếp, ký tay vào khung bằng chuột hoặc màn hình cảm ứng.
 * Hồ sơ thông tin của khách phải đã được gửi (nhân viên có thể điền hộ ở trang hồ sơ).
 */
export default function CounterSign({ contract, profile, onSigned }) {
  const toast = useToast()
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [drawn, setDrawn] = useState(false)
  const [name, setName] = useState(contract.customerName || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const pos = (e) => {
    const cv = canvasRef.current
    const r = cv.getBoundingClientRect()
    const t = e.touches?.[0] || e
    return { x: ((t.clientX - r.left) / r.width) * cv.width, y: ((t.clientY - r.top) / r.height) * cv.height }
  }
  const start = (e) => { drawing.current = true; const c = canvasRef.current.getContext('2d'); const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y) }
  const move = (e) => {
    if (!drawing.current) return
    const c = canvasRef.current.getContext('2d'); const p = pos(e)
    c.lineTo(p.x, p.y); c.stroke(); setDrawn(true)
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const cv = canvasRef.current
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); setDrawn(false)
  }

  const submit = async () => {
    if (!drawn) { toast('Vui lòng để khách ký vào khung trước.', 'error'); return }
    setBusy(true)
    try {
      const updated = await api.rentalContracts.signAtCounter(contract.id, {
        signerName: name.trim() || contract.customerName,
        signatureUrl: canvasRef.current.toDataURL('image/png'),
      })
      toast('Đã ghi nhận chữ ký của khách tại quầy.')
      onSigned?.(updated)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const profileOk = profile && (profile.status === 'SUBMITTED' || profile.status === 'APPROVED')
  return (
    <div style={{ textAlign: 'left' }}>
      {!profileOk && (
        <div style={{ border: '1.5px solid #b45309', color: '#92400e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          Chưa có hồ sơ thông tin hợp đồng đã gửi. Hãy điền hộ khách ở trang hồ sơ (đơn #{contract.reservationId}) trước khi cho khách ký.
        </div>
      )}
      {profile?.signAtCounterRequired && (
        <div style={{ border: '1.5px solid #b91c1c', color: '#991b1b', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          Khách này đã sai hồ sơ 3 lần. Vui lòng đối chiếu giấy tờ gốc thật kỹ trước khi cho ký.
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={520}
        height={170}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{ width: '100%', height: 160, background: '#fff', border: '2px dashed #64748b', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
      />
      <div style={{ marginTop: 10 }}>
        <Input label="Họ và tên người ký" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={clear} disabled={busy}><Eraser size={15} /> Xóa ký lại</Button>
        <Button size="sm" loading={busy} onClick={submit} disabled={!profileOk}><PenTool size={15} /> Ghi nhận chữ ký tại quầy</Button>
      </div>
    </div>
  )
}

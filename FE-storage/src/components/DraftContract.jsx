import { useEffect, useRef, useState } from 'react'
import { Eraser, FileText, PenTool, CheckCircle2 } from 'lucide-react'
import { Card, Button, Input } from './ui.jsx'
import { api, assetUrl } from '../api/client.js'
import { openContractInNewPage } from '../utils/contractDocument.js'
import { fmtDateTime } from '../utils/format.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'

const WAIT_UNIT = '(Quản lý cơ sở sẽ gán ô kho cụ thể sau)'

/**
 * Bản hợp đồng tạm cho đơn đã đóng cọc nhưng quản lý chưa gán ô kho: hiện những gì đang có
 * (thông tin khách, loại kho, giá, thời hạn). Khách tin tưởng có thể ký trước; ô kho cụ thể
 * và nhân viên bàn giao do quản lý gán sau, ghi trong phụ lục bàn giao, khách không phải ký lại.
 */
export default function DraftContract({ reservation: r }) {
  const { user } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState(undefined)
  const [signing, setSigning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(user?.fullname || '')
  const [drawn, setDrawn] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const load = () => api.contractProfiles.get(r.id).then((p) => setProfile(p || null)).catch(() => setProfile(null))
  useEffect(() => { load() }, [r.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a'
  }, [signing])

  const pos = (e) => {
    const cv = canvasRef.current
    const b = cv.getBoundingClientRect()
    const t = e.touches?.[0] || e
    return { x: ((t.clientX - b.left) / b.width) * cv.width, y: ((t.clientY - b.top) / b.height) * cv.height }
  }
  const start = (e) => { drawing.current = true; const c = canvasRef.current.getContext('2d'); const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y) }
  const move = (e) => { if (!drawing.current) return; const c = canvasRef.current.getContext('2d'); const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); setDrawn(true) }
  const end = () => { drawing.current = false }
  const clear = () => { const cv = canvasRef.current; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); setDrawn(false) }

  if (profile === undefined) return null
  const ready = profile && (profile.status === 'SUBMITTED' || profile.status === 'APPROVED')
  if (!ready) return null // chưa gửi hồ sơ thì chưa có gì để hiện

  const months = Number(r.rentalMonths || 0)
  const draft = () => {
    const start = r.startDate ? new Date(r.startDate) : null
    const endDate = start && months ? new Date(start.getFullYear(), start.getMonth() + months, start.getDate() - 1) : null
    return {
      id: r.id, reservationId: r.id, createdAt: r.createdAt, customerName: r.customerName || user?.fullname,
      facilityName: r.facilityName, unitTypeName: r.unitTypeName, unitCode: r.unitCode || WAIT_UNIT,
      startDate: r.startDate, endDate: endDate ? endDate.toISOString().slice(0, 10) : r.startDate,
      monthlyPrice: months && r.estimatedAmount ? Number(r.estimatedAmount) / months : r.estimatedAmount,
      depositAmount: r.refundableDepositAmount ?? r.depositAmount, status: 'PENDING',
      signedAt: profile.preSignedAt, signerName: profile.preSignerName, signatureUrl: profile.preSignatureUrl,
    }
  }
  const view = () => openContractInNewPage(draft(), user, { profile })

  const sign = async () => {
    if (!drawn) { toast('Vui lòng ký vào khung trước.', 'error'); return }
    setBusy(true)
    try {
      await api.rentalContracts.preSign(r.id, { signerName: (name || user?.fullname || 'Khách hàng').trim(), signatureUrl: canvasRef.current.toDataURL('image/png') })
      toast('Đã ký trước. Quản lý sẽ gán ô kho và bổ sung vào hợp đồng, quý khách không phải ký lại.')
      setSigning(false); setDrawn(false); load()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const withdraw = async () => {
    if (!window.confirm('Rút lại chữ ký đã ký trước? Quý khách có thể ký lại sau.')) return
    try { await api.rentalContracts.withdrawPreSign(r.id); toast('Đã rút chữ ký.'); load() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <h4 style={{ marginBottom: 6 }}><FileText size={16} style={{ verticalAlign: -3 }} /> Bản hợp đồng tạm</h4>
      <p className="muted small" style={{ marginBottom: 10 }}>
        Hợp đồng hiện thông tin quý khách đã điền, loại kho, giá và thời hạn. Ô kho cụ thể và nhân viên bàn giao do quản lý cơ sở gán sau;
        khi đó hợp đồng tự cập nhật bản đầy đủ và ghi vào phụ lục bàn giao.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" onClick={view}>Xem bản hợp đồng tạm</Button>
        {profile.preSignedAt ? (
          <>
            <span className="small" style={{ color: 'var(--success, #16a34a)' }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Đã ký trước lúc {fmtDateTime(profile.preSignedAt)}</span>
            <Button size="sm" variant="secondary" onClick={withdraw}>Rút chữ ký</Button>
          </>
        ) : profile.signAtCounterRequired ? (
          <span className="small muted">Hồ sơ cần ký trực tiếp tại cơ sở khi nhận kho.</span>
        ) : !signing && (
          <Button size="sm" onClick={() => setSigning(true)}><PenTool size={14} /> Ký trước</Button>
        )}
      </div>
      {profile.preSignedAt && profile.preSignatureUrl && (
        <img src={assetUrl(profile.preSignatureUrl)} alt="Chữ ký" style={{ marginTop: 10, maxWidth: 220, background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }} />
      )}
      {signing && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <Input label="Họ tên người ký" value={name} onChange={(e) => setName(e.target.value)} />
          <canvas ref={canvasRef} width={520} height={180}
            style={{ width: '100%', maxWidth: 520, border: '1.5px dashed var(--border-strong)', borderRadius: 10, touchAction: 'none', cursor: 'crosshair', background: '#fff' }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={(e) => { e.preventDefault(); move(e) }} onTouchEnd={end} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={clear}><Eraser size={14} /> Xóa nét</Button>
            <Button size="sm" loading={busy} onClick={sign}>Xác nhận ký trước</Button>
            <Button size="sm" variant="ghost" onClick={() => setSigning(false)}>Hủy</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

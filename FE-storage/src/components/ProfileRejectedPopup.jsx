import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../api/client.js'
import { REJECT_REASONS, ContractProfileModal } from '../pages/account/ContractProfile.jsx'

const KEY = 'ss-rejected-popup-dismissed'

/**
 * Thông báo giữa màn hình khi khách vừa vào tài khoản mà hồ sơ hợp đồng bị từ chối.
 * Hai nút: "Chỉnh sửa và ký lại" (tới trang hồ sơ) hoặc "Ký sau" (ở lại trang, không hỏi lại trong phiên này).
 */
export default function ProfileRejectedPopup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // mã đơn đang chỉnh hồ sơ trong cửa sổ nổi

  useEffect(() => {
    if (!user || user.role !== 'CUSTOMER') { setItems([]); return }
    try { if (sessionStorage.getItem(KEY) === String(user.id)) return } catch { /* bỏ qua */ }
    api.contractProfiles.myRejected().then((list) => setItems(list || [])).catch(() => setItems([]))
  }, [user])

  if (editing) {
    return <ContractProfileModal reservationId={editing} onClose={() => setEditing(null)}
      onSubmitted={() => { setEditing(null); setItems([]) }} />
  }
  if (!items.length) return null
  const p = items[0]
  const later = () => {
    try { sessionStorage.setItem(KEY, String(user.id)) } catch { /* bỏ qua */ }
    setItems([])
  }
  const fix = () => setEditing(p.reservationId)

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)', borderRadius: 16, maxWidth: 520, width: '100%', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#b91c1c', fontWeight: 800, fontSize: 18 }}>
          <AlertTriangle size={22} /> Hồ sơ hợp đồng chưa được chấp nhận
        </div>
        <p style={{ marginTop: 10 }}>
          Hồ sơ của đơn thuê kho <strong>#{p.reservationId}</strong> tại <strong>{p.facilityName}</strong> cần chỉnh sửa:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          {(p.rejectReasonCodes || []).map((c) => <li key={c}>{REJECT_REASONS[c] || c}</li>)}
          {p.rejectNote && <li>Ghi chú: {p.rejectNote}</li>}
        </ul>
        <p className="muted small">
          Số lần chưa đạt: {p.rejectCount}/3.{' '}
          {p.signAtCounterRequired
            ? 'Quý khách cần ký hợp đồng trực tiếp tại quầy khi nhận kho, nhân viên sẽ hỗ trợ.'
            : 'Sau khi chỉnh sửa, quý khách cần ký lại hợp đồng. Sau 3 lần chưa đạt, hợp đồng phải ký trực tiếp tại quầy.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={later}>Ký sau</Button>
          <Button onClick={fix}>{p.signAtCounterRequired ? 'Xem hồ sơ' : 'Chỉnh sửa và ký lại'}</Button>
        </div>
      </div>
    </div>
  )
}

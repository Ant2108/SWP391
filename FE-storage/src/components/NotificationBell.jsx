import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { api } from '../api/client.js'

const POLL_MS = 30000

const timeAgo = (iso) => {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-GB')
}

// Chuông thông báo: số chưa đọc cập nhật mỗi 30 giây; bấm để xem danh sách, bấm một thông báo để mở trang liên quan.
export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState(null) // null = đang tải
  const [error, setError] = useState('')
  const ref = useRef(null)

  const refreshCount = useCallback(async () => {
    try { setUnread((await api.notifications.unreadCount()).count || 0) } catch { /* mất mạng / hết phiên: bỏ qua, lần sau thử lại */ }
  }, [])

  const loadList = useCallback(async () => {
    try { setItems(await api.notifications.my()); setError('') } catch (e) { setError(e.message || 'Could not load notifications') }
  }, [])

  useEffect(() => {
    refreshCount()
    const t = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(t)
  }, [refreshCount])

  useEffect(() => {
    if (!open) return
    loadList()
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, loadList])

  const openItem = async (n) => {
    setOpen(false)
    if (!n.read) {
      try { await api.notifications.markRead(n.id) } catch { /* vẫn cho mở trang */ }
      refreshCount()
    }
    if (n.link) navigate(n.link)
  }

  const markAll = async () => {
    try { await api.notifications.markAllRead() } catch { return }
    setItems((list) => (list || []).map((n) => ({ ...n, read: true })))
    setUnread(0)
  }

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn bell-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-haspopup="true" aria-expanded={open}>
        <Bell size={22} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            <button className="bell-markall" onClick={markAll} disabled={!unread}><CheckCheck size={15} /> Mark all as read</button>
          </div>
          <div className="bell-list">
            {error ? <p className="bell-empty">{error}</p>
              : items === null ? <p className="bell-empty">Loading…</p>
              : !items.length ? <p className="bell-empty">You have no notifications yet.</p>
              : items.map((n) => (
                <button key={n.id} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                  <span className="bell-item-title">{n.title}</span>
                  {n.message && <span className="bell-item-msg">{n.message}</span>}
                  <span className="bell-item-time">{timeAgo(n.createdAt)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Textarea } from './ui.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { fmtDateTime } from '../utils/format.js'

// Cuộc trao đổi của một Support Request: danh sách tin nhắn (khách / nhân viên) và ô trả lời.
// onSend(message) gửi tin và trả về yêu cầu đã cập nhật (hoặc ném lỗi).
export default function SupportThread({ replies = [], canReply, onSend, placeholder }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try { await onSend(text.trim()); setText('') }
    catch (e) { toast(e.message || 'Không gửi được phản hồi', 'error') }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <strong>Cuộc trao đổi</strong>
      {!replies.length && <p className="muted small" style={{ margin: 0 }}>Chưa có phản hồi nào.</p>}
      {replies.map((r) => (
        <div key={r.id} style={{
          justifySelf: r.staffReply ? 'start' : 'end', maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
          background: r.staffReply ? 'var(--surface-2)' : 'var(--primary-soft)',
        }}>
          <div className="muted small">{r.authorName}{r.staffReply ? ' (staff)' : ''} · {fmtDateTime(r.createdAt)}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>
        </div>
      ))}
      {canReply && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Textarea label="Phản hồi của quý khách" maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} hint={placeholder} />
          <div><Button size="sm" onClick={send} loading={sending} disabled={!text.trim()}><Send size={14} /> Gửi phản hồi</Button></div>
        </div>)}
    </div>
  )
}

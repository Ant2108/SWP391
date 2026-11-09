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
    catch (e) { toast(e.message || 'Could not send the reply', 'error') }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <strong>Conversation</strong>
      {!replies.length && <p className="muted small" style={{ margin: 0 }}>No replies yet.</p>}
      {replies.map((r) => (
        <div key={r.id} style={{
          justifySelf: r.staffReply ? 'start' : 'end', maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
          background: r.staffReply ? 'var(--surface-2, #f3f0e8)' : 'var(--accent-soft, #fdf1cf)',
        }}>
          <div className="muted small">{r.authorName}{r.staffReply ? ' (staff)' : ''} · {fmtDateTime(r.createdAt)}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>
        </div>
      ))}
      {canReply && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Textarea label="Your reply" maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} hint={placeholder} />
          <div><Button size="sm" onClick={send} loading={sending} disabled={!text.trim()}><Send size={14} /> Send reply</Button></div>
        </div>)}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Phone, MessageSquare } from 'lucide-react'
import { PageHeader, Card, Button, Badge, Input, Select, Textarea, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { mock } from '../../api/mock.js'
import { fmtDateTime } from '../../utils/format.js'

const CATEGORIES = ['Reservation', 'Payment', 'Access / security', 'Move in / out', 'Other']
const BLANK = { subject: '', category: CATEGORIES[0], facilityName: '', message: '' }

export default function Support() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tickets = useAsync(() => mock.tickets.list())
  const facilities = useAsync(() => api.facilities.list())
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [viewId, setViewId] = useState(null)
  const [reply, setReply] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const view = tickets.data?.find((t) => t.id === viewId)

  // /account/support?new=1&facility=ID (từ nút "Contact staff") mở sẵn form tạo yêu cầu.
  useEffect(() => {
    if (params.get('new') !== '1' || !facilities.data) return
    const f = facilities.data.find((x) => String(x.id) === params.get('facility'))
    setForm({ ...BLANK, facilityName: f?.name || '', subject: params.get('subject') || '' })
    setCreating(true)
    setParams({}, { replace: true })
  }, [params, facilities.data, setParams])

  const create = async () => {
    const t = await mock.tickets.create(form)
    toast('Request sent to our staff')
    setCreating(false); setForm(BLANK)
    tickets.reload(); setViewId(t.id)
  }

  const send = async (e) => {
    e.preventDefault()
    if (!reply.trim()) return
    await mock.tickets.reply(viewId, reply.trim()); setReply(''); tickets.reload()
  }

  return (
    <>
      <PageHeader title="Support" subtitle="Ask our staff for help."
        actions={<Button onClick={() => { setForm(BLANK); setCreating(true) }}><Plus size={18} /> New request</Button>} />
      <Card className="loc-card" style={{ marginBottom: 24 }}>
        <div className="meta"><Phone size={18} /><span>Need help right now? Call the facility directly. Phone numbers are on the <Link to="/contact" style={{ textDecoration: 'underline' }}>Contact</Link> page.</span></div>
      </Card>

      {tickets.loading ? <LoadingState /> : tickets.error ? <ErrorState error={tickets.error} onRetry={tickets.reload} /> :
        !tickets.data.length ? <EmptyState title="No support requests" message="Send a request and our staff will get back to you." /> : (
          <div className="grid grid-3">
            {tickets.data.map((t) => (
              <Card hover key={t.id} className="loc-card" onClick={() => setViewId(t.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3>{t.subject}</h3><Badge status={t.status} /></div>
                <div className="muted small">{t.category}{t.facilityName ? ` · ${t.facilityName}` : ''}</div>
                <div className="meta"><MessageSquare size={18} /><span>{t.messages.length} message{t.messages.length > 1 ? 's' : ''} · {fmtDateTime(t.createdAt)}</span></div>
              </Card>
            ))}
          </div>
        )}

      <FormModal open={creating} title="New support request" onClose={() => setCreating(false)} onSubmit={create} submitText="Send">
        <div className="span-2"><Input label="Subject" required maxLength={120} value={form.subject} onChange={set('subject')} /></div>
        <Select label="Category" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select label="Facility" value={form.facilityName} onChange={set('facilityName')}>
          <option value="">Not specific</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
        </Select>
        <div className="span-2"><Textarea label="Message" required maxLength={1000} value={form.message} onChange={set('message')} /></div>
      </FormModal>

      <Modal wide open={!!view} title={view?.subject || ''} onClose={() => setViewId(null)}>
        {view && (
          <div style={{ display: 'grid', gap: 12 }}>
            {view.messages.map((m, i) => (
              <div key={i} style={{ background: 'var(--primary-soft)', borderRadius: 12, padding: '10px 14px' }}>
                <div className="muted small">You · {fmtDateTime(m.at)}</div>{m.text}
              </div>
            ))}
            <p className="muted small">Demo only: requests are stored in this browser and are not delivered to staff yet.</p>
            {view.status === 'OPEN' ? (
              <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
                <Textarea label="Add a message" value={reply} onChange={(e) => setReply(e.target.value)} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="submit" size="sm">Send</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={async () => { await mock.tickets.close(view.id); tickets.reload() }}>Close request</Button>
                </div>
              </form>
            ) : <Badge status="CLOSED" />}
          </div>
        )}
      </Modal>
    </>
  )
}

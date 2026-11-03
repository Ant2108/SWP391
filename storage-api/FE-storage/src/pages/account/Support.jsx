import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Phone, UserRound } from 'lucide-react'
import { PageHeader, Card, Button, Badge, Input, Select, Textarea, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, SUPPORT_TYPES, SUPPORT_PRIORITIES } from '../../api/client.js'
import { fmtDateTime, label } from '../../utils/format.js'

const BLANK = { rentalContractId: '', supportType: 'UNIT', title: '', description: '', priority: 'MEDIUM' }

export default function Support() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const requests = useAsync(() => api.supportRequests.my())
  const options = useAsync(() => api.appointments.bookingOptions())
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [viewId, setViewId] = useState(null)
  const [closing, setClosing] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const view = requests.data?.find((r) => r.id === viewId)
  const contracts = options.data?.contracts || []

  // /account/support?new=1&subject=... (từ nút "Contact staff") mở sẵn form tạo yêu cầu.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setForm({ ...BLANK, title: params.get('subject') || '' })
    setCreating(true)
    setParams({}, { replace: true })
  }, [params, setParams])

  const create = async () => {
    if (!form.rentalContractId) throw new Error('Please choose the rented unit this request is about')
    const r = await api.supportRequests.create({
      rentalContractId: Number(form.rentalContractId), supportType: form.supportType,
      title: form.title, description: orNull(form.description), priority: form.priority,
    })
    toast('Request sent to our staff')
    setCreating(false); setForm(BLANK)
    requests.reload(); setViewId(r.id)
  }

  const closeRequest = async () => {
    setClosing(true)
    try { await api.supportRequests.setStatus(view.id, 'CLOSED'); toast('Request closed'); requests.reload() }
    catch (e) { toast(e.message, 'error') } finally { setClosing(false) }
  }

  return (
    <>
      <PageHeader title="Support" subtitle="Ask our staff for help with your rented unit."
        actions={<Button onClick={() => { setForm(BLANK); setCreating(true) }}><Plus size={18} /> New request</Button>} />
      <Card className="loc-card" style={{ marginBottom: 24 }}>
        <div className="meta"><Phone size={18} /><span>Need help right now? Call the facility directly. Phone numbers are on the <Link to="/contact" style={{ textDecoration: 'underline' }}>Contact</Link> page.</span></div>
      </Card>

      {requests.loading ? <LoadingState /> : requests.error ? <ErrorState error={requests.error} onRetry={requests.reload} /> :
        !requests.data.length ? <EmptyState title="No support requests" message="Send a request and our staff will get back to you." /> : (
          <div className="grid grid-3">
            {requests.data.map((r) => (
              <Card hover key={r.id} className="loc-card" onClick={() => setViewId(r.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3>{r.title}</h3><Badge status={r.status} /></div>
                <div className="muted small">{label(r.supportType)} · Unit {r.unitCode} · {r.facilityName}</div>
                <div className="meta"><UserRound size={18} /><span>{r.assignedStaffName ? `Handled by ${r.assignedStaffName}` : 'Waiting for a staff member'} · {fmtDateTime(r.createdAt)}</span></div>
              </Card>
            ))}
          </div>
        )}

      <FormModal open={creating} title="New support request" onClose={() => setCreating(false)} onSubmit={create} submitText="Send">
        <div className="span-2">
          <Select label="Rented unit" required value={form.rentalContractId} onChange={set('rentalContractId')}
            hint={!options.loading && !contracts.length ? 'You need an active rental to send a request.' : undefined}>
            <option value="">Select…</option>
            {contracts.map((c) => <option key={c.rentalContractId} value={c.rentalContractId}>Unit {c.unitCode} at {c.facilityName}</option>)}
          </Select>
        </div>
        <Select label="Type" value={form.supportType} onChange={set('supportType')}>{SUPPORT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Select label="Priority" value={form.priority} onChange={set('priority')}>{SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        <div className="span-2"><Input label="Title" required maxLength={200} value={form.title} onChange={set('title')} /></div>
        <div className="span-2"><Textarea label="Description" maxLength={1000} value={form.description} onChange={set('description')} /></div>
      </FormModal>

      <Modal wide open={!!view} title={view?.title || ''} onClose={() => setViewId(null)}>
        {view && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge status={view.status} /><Badge status={view.priority} /><span className="muted small">{label(view.supportType)}</span></div>
            <p>{view.description || <span className="muted">No description.</span>}</p>
            <div className="muted small">Unit {view.unitCode} · {view.facilityName}</div>
            <div className="muted small">Sent {fmtDateTime(view.createdAt)}{view.resolvedAt ? ` · Resolved ${fmtDateTime(view.resolvedAt)}` : ''}</div>
            <div className="muted small">{view.assignedStaffName ? `Handled by ${view.assignedStaffName}` : 'A manager will assign a staff member soon.'}</div>
            {view.status === 'RESOLVED' && (
              <div><Button size="sm" onClick={closeRequest} loading={closing}>Confirm resolved and close</Button></div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

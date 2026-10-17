import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, Textarea, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { mock } from '../../api/mock.js'
import { fmtDate } from '../../utils/format.js'

const PURPOSES = ['Unit viewing', 'Move in', 'Move out', 'Other']
const EMPTY = { facilityId: '', date: '', time: '09:00', purpose: PURPOSES[0], note: '' }
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)

export default function Appointments() {
  const toast = useToast()
  const list = useAsync(() => mock.appointments.list())
  const facilities = useAsync(() => api.facilities.list())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [cancelling, setCancelling] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const active = (facilities.data || []).filter((f) => f.status === 'ACTIVE')

  const save = async () => {
    const f = active.find((x) => String(x.id) === form.facilityId)
    if (!f) throw new Error('Please choose a facility')
    if (!form.date) throw new Error('Please choose a date')
    await mock.appointments.create({ ...form, facilityId: f.id, facilityName: f.name })
    toast('Appointment booked')
    setOpen(false); list.reload()
  }

  const cancel = async () => { await mock.appointments.cancel(cancelling.id); toast('Appointment cancelled'); setCancelling(null); list.reload() }

  const columns = [
    { key: 'when', header: 'When', render: (a) => <><div className="cell-title">{fmtDate(a.date)} · {a.time}</div><div className="cell-sub">{a.id}</div></> },
    { key: 'where', header: 'Facility', render: (a) => a.facilityName },
    { key: 'purpose', header: 'Purpose', render: (a) => <>{a.purpose}{a.note && <div className="cell-sub">{a.note}</div>}</> },
    { key: 'status', header: 'Status', render: (a) => <Badge status={a.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (a) => a.status === 'SCHEDULED' &&
      <Button size="sm" variant="danger-outline" onClick={() => setCancelling(a)}><X size={14} /> Cancel</Button> },
  ]

  return (
    <>
      <PageHeader title="Appointments" subtitle="Book a visit to one of our facilities."
        actions={<Button onClick={() => { setForm({ ...EMPTY, date: tomorrow() }); setOpen(true) }}><Plus size={18} /> New appointment</Button>} />
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id" empty={<EmptyState title="No appointments" message="Book a viewing or a move-in time." />} />}

      <FormModal open={open} title="New appointment" onClose={() => setOpen(false)} onSubmit={save} submitText="Book">
        <div className="span-2">
          <Select label="Facility" required value={form.facilityId} onChange={set('facilityId')}>
            <option value="">Select facility</option>
            {active.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <Input label="Date" type="date" required min={tomorrow()} value={form.date} onChange={set('date')} />
        <Input label="Time" type="time" required value={form.time} onChange={set('time')} />
        <div className="span-2"><Select label="Purpose" value={form.purpose} onChange={set('purpose')}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</Select></div>
        <div className="span-2"><Textarea label="Note" maxLength={300} value={form.note} onChange={set('note')} /></div>
      </FormModal>

      <ConfirmDialog open={!!cancelling} danger title="Cancel appointment" confirmText="Cancel appointment"
        message={`Cancel your visit to ${cancelling?.facilityName} on ${fmtDate(cancelling?.date)}?`} onConfirm={cancel} onClose={() => setCancelling(null)} />
    </>
  )
}

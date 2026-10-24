import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, Textarea, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { fmtDateTime, label } from '../../utils/format.js'

const TYPES = [
  { value: 'CHECK_IN', text: 'Check-in (receive my unit)' },
  { value: 'RETURN', text: 'Return my unit' },
  { value: 'SUPPORT', text: 'On-site support' },
]
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const EMPTY = { type: 'CHECK_IN', target: '', date: '', time: '09:00', notes: '' }

export default function Appointments() {
  const toast = useToast()
  const list = useAsync(() => api.appointments.my())
  const options = useAsync(() => api.appointments.bookingOptions())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [cancelling, setCancelling] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const targets = form.type === 'CHECK_IN'
    ? (options.data?.checkIns || []).map((o) => ({ id: o.reservationId, text: `Unit ${o.unitCode} at ${o.facilityName} (from ${o.startDate})` }))
    : (options.data?.contracts || []).map((o) => ({ id: o.rentalContractId, text: `Unit ${o.unitCode} at ${o.facilityName} (until ${o.endDate})` }))

  const save = async () => {
    if (!form.target) throw new Error(form.type === 'CHECK_IN' ? 'No reservation is ready for check-in yet' : 'Please choose a rented unit')
    if (!form.date) throw new Error('Please choose a date')
    await api.appointments.create({
      appointmentType: form.type,
      ...(form.type === 'CHECK_IN' ? { reservationId: Number(form.target) } : { rentalContractId: Number(form.target) }),
      scheduledAt: `${form.date}T${form.time}:00`,
      notes: orNull(form.notes),
    })
    toast('Appointment booked. A manager will assign a staff member.')
    setOpen(false); list.reload(); options.reload()
  }

  const cancel = async () => {
    await api.appointments.cancel(cancelling.id)
    toast('Appointment cancelled')
    setCancelling(null); list.reload(); options.reload()
  }

  const columns = [
    { key: 'when', header: 'When', render: (a) => <><div className="cell-title">{fmtDateTime(a.scheduledAt)}</div><div className="cell-sub">#{a.id}</div></> },
    { key: 'what', header: 'Appointment', render: (a) => <><div className="cell-title">{label(a.appointmentType)}</div><div className="cell-sub">{[a.unitCode && `Unit ${a.unitCode}`, a.facilityName].filter(Boolean).join(' · ')}</div></> },
    { key: 'staff', header: 'Staff', render: (a) => a.staffName || <span className="muted">Waiting for assignment</span> },
    { key: 'status', header: 'Status', render: (a) => <Badge status={a.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (a) => a.status === 'SCHEDULED' &&
      <Button size="sm" variant="danger-outline" onClick={() => setCancelling(a)}><X size={14} /> Cancel</Button> },
  ]

  return (
    <>
      <PageHeader title="Appointments" subtitle="Book a check-in, a return or on-site help at your facility."
        actions={<Button onClick={() => { setForm({ ...EMPTY, date: tomorrow() }); setOpen(true) }}><Plus size={18} /> New appointment</Button>} />
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id" empty={<EmptyState title="No appointments" message="Book a check-in once your reservation is confirmed and the deposit is paid." />} />}

      <FormModal open={open} title="New appointment" onClose={() => setOpen(false)} onSubmit={save} submitText="Book">
        <div className="span-2">
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, target: '' })}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.text}</option>)}
          </Select>
        </div>
        <div className="span-2">
          <Select label={form.type === 'CHECK_IN' ? 'Reservation' : 'Rented unit'} required value={form.target} onChange={set('target')}
            hint={options.loading ? 'Loading…' : !targets.length ? (form.type === 'CHECK_IN' ? 'Nothing ready: your reservation must be confirmed, assigned a unit and the deposit paid.' : 'You have no active rental yet.') : undefined}>
            <option value="">Select…</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.text}</option>)}
          </Select>
        </div>
        <Input label="Date" type="date" required min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={set('date')} />
        <Input label="Time" type="time" required value={form.time} onChange={set('time')} />
        <div className="span-2"><Textarea label="Note" maxLength={500} value={form.notes} onChange={set('notes')} /></div>
      </FormModal>

      <ConfirmDialog open={!!cancelling} danger title="Cancel appointment" confirmText="Cancel appointment"
        message={`Cancel your ${label(cancelling?.appointmentType).toLowerCase()} appointment on ${fmtDateTime(cancelling?.scheduledAt)}?`}
        onConfirm={cancel} onClose={() => setCancelling(null)} />
    </>
  )
}

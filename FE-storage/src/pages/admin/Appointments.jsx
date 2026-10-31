import { useState } from 'react'
import { UserPlus, CalendarClock, XCircle, UserX, KeyRound, ClipboardCheck, Flag, CheckCircle2 } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, Textarea, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull, numOrNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, APPOINTMENT_TYPES, APPOINTMENT_STATUSES } from '../../api/client.js'
import { fmtDateTime, label } from '../../utils/format.js'

const checkbox = { display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }
const actionsRow = { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }

// Staff: việc hôm nay được gán cho mình (check-in, trả kho, báo khách vắng). Manager: gán staff, đổi lịch,
// hủy, đánh NO_SHOW và xử lý các lịch staff đã báo khách không đến. Admin: chỉ xem.
export default function Appointments() {
  const { user } = useAuth()
  const toast = useToast()
  const isManager = user?.role === 'FACILITY_MANAGER'
  const isStaff = user?.role === 'FACILITY_STAFF'
  const canWork = isManager || isStaff

  const [view, setView] = useState(canWork ? 'today' : 'all') // today | all | noshow
  const [filters, setFilters] = useState({ type: '', status: '', date: '' })
  const list = useAsync(() => {
    if (view === 'today') return api.appointments.today()
    return api.appointments.list({ ...filters, noShowReported: view === 'noshow' ? true : undefined })
  }, [view, filters.type, filters.status, filters.date])

  const [modal, setModal] = useState(null) // { kind, appt }
  const [form, setForm] = useState({})
  const staffList = useAsync(
    () => (modal?.kind === 'assign' ? api.appointments.staff() : Promise.resolve([])),
    [modal?.kind, modal?.appt?.id])
  const staffOptions = staffList.data || []

  const open = (kind, appt, initial = {}) => { setModal({ kind, appt }); setForm(initial) }
  const close = () => setModal(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const done = (msg) => { toast(msg); close(); list.reload() }

  const submit = async () => {
    const { kind, appt } = modal
    if (kind === 'assign') {
      if (!form.staffId) throw new Error('Please choose a staff member')
      await api.appointments.assign(appt.id, Number(form.staffId)); done('Staff assigned')
    } else if (kind === 'reschedule') {
      if (!form.date) throw new Error('Please choose a date')
      await api.appointments.reschedule(appt.id, `${form.date}T${form.time || '09:00'}:00`); done('Appointment rescheduled')
    } else if (kind === 'complete') {
      await api.appointments.complete(appt.id, { keyHandedOver: appt.appointmentType === 'CHECK_IN' ? !!form.keyHandedOver : undefined, notes: orNull(form.notes) })
      done(appt.appointmentType === 'CHECK_IN' ? 'Check-in completed. The contract is now active.' : 'Appointment completed')
    } else if (kind === 'return') {
      const r = await api.unitReturns.create({
        rentalContractId: appt.rentalContractId, appointmentId: appt.id, unitCondition: orNull(form.unitCondition),
        hasDamage: !!form.hasDamage, damageDescription: form.hasDamage ? orNull(form.damageDescription) : null,
        damageFee: form.hasDamage ? numOrNull(form.damageFee) : null, notes: orNull(form.notes),
      })
      done(r.hasDamage ? 'Return recorded. A damage fee was issued and the unit is under maintenance.' : 'Return recorded. The unit is available again.')
    } else if (kind === 'report') {
      await api.appointments.reportNoShow(appt.id, form.note || ''); done('Reported to the facility manager')
    }
  }

  const confirm = async () => {
    const { kind, appt } = modal
    try {
      if (kind === 'cancel') { await api.appointments.cancel(appt.id); done('Appointment cancelled') }
      else { await api.appointments.markNoShow(appt.id); done('Marked as no-show') }
    } catch (e) { toast(e.message, 'error') }
  }

  const rowActions = (a) => {
    if (a.status !== 'SCHEDULED') return null
    const mine = a.staffId === user?.userId
    return (
      <div style={actionsRow}>
        {isManager && <Button size="sm" variant="secondary" onClick={() => open('assign', a, { staffId: a.staffId || '' })}><UserPlus size={14} /> {a.staffId ? 'Reassign' : 'Assign'}</Button>}
        {isManager && <Button size="sm" variant="secondary" onClick={() => open('reschedule', a, { date: a.scheduledAt.slice(0, 10), time: a.scheduledAt.slice(11, 16) })}><CalendarClock size={14} /> Reschedule</Button>}
        {isStaff && mine && a.appointmentType === 'RETURN' && <Button size="sm" onClick={() => open('return', a, { hasDamage: false })}><ClipboardCheck size={14} /> Inspect &amp; return</Button>}
        {(isStaff && mine || isManager) && a.appointmentType === 'CHECK_IN' && <Button size="sm" onClick={() => open('complete', a, { keyHandedOver: false })}><KeyRound size={14} /> Check in</Button>}
        {(isStaff && mine || isManager) && a.appointmentType === 'SUPPORT' && <Button size="sm" onClick={() => open('complete', a, {})}><CheckCircle2 size={14} /> Complete</Button>}
        {isStaff && mine && !a.noShowReported && <Button size="sm" variant="secondary" onClick={() => open('report', a, { note: '' })}><Flag size={14} /> Report no-show</Button>}
        {isManager && <Button size="sm" variant="danger-outline" onClick={() => open('noshow', a)}><UserX size={14} /> No-show</Button>}
        {isManager && <Button size="sm" variant="danger-outline" onClick={() => open('cancel', a)}><XCircle size={14} /> Cancel</Button>}
      </div>
    )
  }

  const columns = [
    { key: 'when', header: 'When', render: (a) => <><div className="cell-title">{fmtDateTime(a.scheduledAt)}</div><div className="cell-sub">#{a.id}</div></> },
    { key: 'customer', header: 'Customer', render: (a) => <><div className="cell-title">{a.customerName}</div><div className="cell-sub">{a.customerPhone || '—'}</div></> },
    { key: 'what', header: 'Appointment', render: (a) => <><div className="cell-title">{label(a.appointmentType)}</div><div className="cell-sub">{[a.unitCode && `Unit ${a.unitCode}`, a.facilityName].filter(Boolean).join(' · ')}</div></> },
    { key: 'staff', header: 'Staff', render: (a) => a.staffName || <span className="muted">Not assigned</span> },
    { key: 'status', header: 'Status', render: (a) => (
      <>
        <Badge status={a.status} />
        {a.noShowReported && <div style={{ marginTop: 6 }}><Badge tone="red">No-show reported</Badge></div>}
        {a.notes && <div className="cell-sub" style={{ maxWidth: 260 }}>{a.notes}</div>}
      </>) },
    { key: 'actions', header: '', className: 'actions', render: rowActions },
  ]

  const titles = {
    assign: 'Assign staff', reschedule: 'Reschedule appointment',
    complete: modal?.appt?.appointmentType === 'CHECK_IN' ? 'Complete check-in' : 'Complete appointment',
    return: 'Inspect and return unit', report: 'Report customer no-show',
  }
  const formOpen = !!modal && modal.kind in titles

  return (
    <>
      <PageHeader title="Appointments"
        subtitle={isStaff ? 'Your appointments: check customers in, inspect returned units and report no-shows.' : isManager ? 'Assign staff and follow up on every appointment at your facility.' : 'All appointments (read only).'} />
      <div className="toolbar">
        {canWork && <Select label="View" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="today">Today</option>
          <option value="all">All appointments</option>
          {isManager && <option value="noshow">No-show reports to handle</option>}
        </Select>}
        {view !== 'today' && <>
          <Select label="Type" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">All types</option>
            {APPOINTMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
          <Select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Input label="Date" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </>}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id"
          empty={<EmptyState title={view === 'noshow' ? 'No reports to handle' : 'No appointments'} message={view === 'today' ? (isStaff ? 'Nothing is assigned to you today.' : 'Nothing is scheduled at your facility today.') : 'Try different filters.'} />} />}

      <FormModal open={formOpen} title={titles[modal?.kind] || ''} onClose={close} onSubmit={submit}
        submitText={{ assign: 'Assign', reschedule: 'Reschedule', complete: 'Complete', return: 'Record return', report: 'Send report' }[modal?.kind]}>
        {modal?.kind === 'assign' && (
          <div className="span-2">
            <Select label="Staff member" required value={form.staffId || ''} onChange={set('staffId')}
              hint={!staffList.loading && !staffOptions.length ? 'No staff are assigned to this facility yet.' : undefined}>
              <option value="">Select staff</option>
              {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.fullname}</option>)}
            </Select>
          </div>)}
        {modal?.kind === 'reschedule' && <>
          <Input label="Date" type="date" required value={form.date || ''} onChange={set('date')} />
          <Input label="Time" type="time" required value={form.time || ''} onChange={set('time')} />
          <p className="muted small span-2">The customer will be notified of the new time.</p>
        </>}
        {modal?.kind === 'complete' && <>
          {modal.appt.appointmentType === 'CHECK_IN' && (
            <label className="span-2" style={checkbox}>
              <input type="checkbox" checked={!!form.keyHandedOver} onChange={set('keyHandedOver')} />
              <span>I handed the key of unit <strong>{modal.appt.unitCode}</strong> to the customer</span>
            </label>)}
          <div className="span-2"><Textarea label="Notes" maxLength={300} value={form.notes || ''} onChange={set('notes')} /></div>
        </>}
        {modal?.kind === 'return' && <>
          <div className="span-2"><Textarea label="Unit condition" maxLength={500} value={form.unitCondition || ''} onChange={set('unitCondition')} hint="Describe what you saw when inspecting the unit." /></div>
          <label className="span-2" style={checkbox}>
            <input type="checkbox" checked={!!form.hasDamage} onChange={set('hasDamage')} />
            <span>The unit or its lock/door is damaged</span>
          </label>
          {form.hasDamage && <>
            <div className="span-2"><Textarea label="Damage description" required maxLength={500} value={form.damageDescription || ''} onChange={set('damageDescription')} /></div>
            <Input label="Damage fee" type="number" min="0" step="0.01" required value={form.damageFee || ''} onChange={set('damageFee')} hint="Charged to the customer. The unit goes to maintenance." />
          </>}
          <div className="span-2"><Textarea label="Notes" maxLength={500} value={form.notes || ''} onChange={set('notes')} /></div>
        </>}
        {modal?.kind === 'report' && (
          <div className="span-2"><Textarea label="What happened?" required maxLength={250} value={form.note || ''} onChange={set('note')}
            hint="The facility manager will contact the customer. The appointment status does not change." /></div>)}
      </FormModal>

      <ConfirmDialog open={modal?.kind === 'cancel' || modal?.kind === 'noshow'} danger
        title={modal?.kind === 'cancel' ? 'Cancel appointment' : 'Mark as no-show'}
        confirmText={modal?.kind === 'cancel' ? 'Cancel appointment' : 'Mark no-show'}
        message={modal?.kind === 'cancel'
          ? `Cancel ${label(modal?.appt?.appointmentType).toLowerCase()} of ${modal?.appt?.customerName} on ${fmtDateTime(modal?.appt?.scheduledAt)}? The customer is notified.`
          : `Mark ${modal?.appt?.customerName} as a no-show for ${fmtDateTime(modal?.appt?.scheduledAt)}? They will need to book again.`}
        onConfirm={confirm} onClose={close} />
    </>
  )
}

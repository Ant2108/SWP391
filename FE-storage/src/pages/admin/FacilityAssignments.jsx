import { useState } from 'react'
import { Plus, Pencil, UserMinus } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'

const STAFF_ROLES = ['FACILITY_STAFF', 'FACILITY_MANAGER']
const label = (s) => s.replace(/_/g, ' ')

export default function FacilityAssignments() {
  const toast = useToast()
  const [facilityId, setFacilityId] = useState('')
  const facilities = useAsync(() => api.facilities.list())
  const users = useAsync(() => api.users.list())
  const rows = useAsync(() => api.facilityAssignments.list(facilityId || undefined), [facilityId])
  const [editing, setEditing] = useState(null) // null | 'new' | assignment
  const [form, setForm] = useState({ userId: '', facilityId: '' })
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const staff = (users.data || []).filter((u) => STAFF_ROLES.includes(u.role) && u.status === 'ACTIVE')

  const openForm = (a) => {
    setEditing(a || 'new')
    setForm(a ? { userId: String(a.userId), facilityId: String(a.facilityId) } : { userId: '', facilityId: facilityId })
  }

  const save = async () => {
    const body = { userId: Number(form.userId), facilityId: Number(form.facilityId) }
    if (editing === 'new') await api.facilityAssignments.create(body)
    else await api.facilityAssignments.update(editing.id, body)
    toast(editing === 'new' ? 'User assigned' : 'Assignment updated')
    setEditing(null); rows.reload()
  }

  const remove = async () => {
    setBusy(true)
    try { await api.facilityAssignments.remove(removing.id); toast('Assignment removed'); setRemoving(null); rows.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'user', header: 'User', render: (a) => <div className="cell-title">{a.userFullname}</div> },
    { key: 'role', header: 'Role', render: (a) => <Badge tone="blue">{label(a.userRole)}</Badge> },
    { key: 'facility', header: 'Facility', render: (a) => a.facilityName },
    { key: 'actions', header: '', className: 'actions', render: (a) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(a)}><Pencil size={14} /> Change</Button>
        <Button size="sm" variant="danger-outline" onClick={() => setRemoving(a)}><UserMinus size={14} /> Remove</Button>
      </>) },
  ]

  return (
    <>
      <PageHeader title="Facility Assignments" subtitle="Assign staff and managers to facilities."
        actions={<Button onClick={() => openForm()}><Plus size={18} /> Assign user</Button>} />
      <div className="toolbar">
        <Select label="Facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          <option value="">All facilities</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </div>
      {rows.loading ? <LoadingState /> : rows.error ? <ErrorState error={rows.error} onRetry={rows.reload} /> :
        <DataTable columns={columns} rows={rows.data} rowKey="id" empty={<EmptyState title="No assignments" message="Assign a staff member to a facility." />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'Assign user' : 'Change assignment'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2">
          <Select label="User" required hint="Only active facility staff and managers" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} disabled={editing !== 'new'}>
            <option value="">Select user</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.fullname} ({label(u.role)})</option>)}
          </Select>
        </div>
        <div className="span-2">
          <Select label="Facility" required value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })}>
            <option value="">Select facility</option>
            {facilities.data?.filter((f) => f.status === 'ACTIVE').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
      </FormModal>

      <ConfirmDialog open={!!removing} danger loading={busy} title="Remove assignment" confirmText="Remove"
        message={`Remove ${removing?.userFullname} from ${removing?.facilityName}?`} onConfirm={remove} onClose={() => setRemoving(null)} />
    </>
  )
}

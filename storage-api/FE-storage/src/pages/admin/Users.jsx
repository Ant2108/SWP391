import { useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'

const EMPTY = { fullname: '', email: '', phone: '', password: '', role: 'CUSTOMER' }
const label = (s) => s.replace(/_/g, ' ')

export default function Users() {
  const toast = useToast()
  const users = useAsync(() => api.users.list())
  const roles = useAsync(() => api.users.roles())
  const [role, setRole] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | user
  const [form, setForm] = useState(EMPTY)
  const [deactivating, setDeactivating] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const openForm = (u) => {
    setEditing(u || 'new')
    setForm(u ? { ...EMPTY, fullname: u.fullname, email: u.email, phone: u.phone || '', role: u.role } : EMPTY)
  }

  const save = async () => {
    if (editing === 'new') await api.users.create(form)
    else await api.users.update(editing.id, { fullname: form.fullname, email: form.email, phone: form.phone })
    toast(editing === 'new' ? 'User created' : 'User updated')
    setEditing(null); users.reload()
  }

  const run = async (u, fn, msg) => {
    setBusyId(u.id)
    try { await fn(); toast(msg); users.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusyId(null) }
  }

  const columns = [
    { key: 'name', header: 'User', render: (u) => <><div className="cell-title">{u.fullname}</div><div className="cell-sub">{u.email}</div></> },
    { key: 'phone', header: 'Phone', render: (u) => u.phone || '—' },
    { key: 'role', header: 'Role', render: (u) => (
      <select className="input" style={{ minHeight: 36, padding: '6px 34px 6px 10px', fontSize: 14, width: 180 }} aria-label={`Role of ${u.email}`}
        value={u.role} disabled={busyId === u.id || !roles.data}
        onChange={(e) => run(u, () => api.users.updateRole(u.id, e.target.value), `${u.email} is now ${label(e.target.value)}`)}>
        {(roles.data || [u.role]).map((r) => <option key={r} value={r}>{label(r)}</option>)}
      </select>) },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (u) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(u)}><Pencil size={14} /> Edit</Button>
        {u.status === 'ACTIVE'
          ? <Button size="sm" variant="danger-outline" onClick={() => setDeactivating(u)}><Ban size={14} /> Deactivate</Button>
          : <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => run(u, () => api.users.updateStatus(u.id, 'ACTIVE'), 'User reactivated')}><RotateCcw size={14} /> Activate</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Users" subtitle="Manage accounts and roles." actions={<Button onClick={() => openForm()}><Plus size={18} /> New user</Button>} />
      <div className="toolbar">
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {roles.data?.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
      </div>
      {users.loading ? <LoadingState /> : users.error ? <ErrorState error={users.error} onRetry={users.reload} /> :
        <DataTable columns={columns} rows={users.data.filter((u) => !role || u.role === role)} rowKey="id" empty={<EmptyState title="No users" />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'New user' : 'Edit user'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Full name" required minLength={2} maxLength={100} value={form.fullname} onChange={set('fullname')} /></div>
        <div className="span-2"><Input label="Email" type="email" required value={form.email} onChange={set('email')} /></div>
        <div className="span-2"><Input label="Phone" required hint="10 digits starting with 0" value={form.phone} onChange={set('phone')} /></div>
        {editing === 'new' && <>
          <Input label="Password" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <Select label="Role" value={form.role} onChange={set('role')}>
            {(roles.data || ['CUSTOMER']).map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </Select>
        </>}
      </FormModal>

      <ConfirmDialog open={!!deactivating} danger loading={busyId === deactivating?.id} title="Deactivate user" confirmText="Deactivate"
        message={`Deactivate ${deactivating?.email}? They will no longer be able to sign in.`}
        onConfirm={async () => { const u = deactivating; await run(u, () => api.users.remove(u.id), 'User deactivated'); setDeactivating(null) }}
        onClose={() => setDeactivating(null)} />
    </>
  )
}

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
    toast(editing === 'new' ? 'Đã gán người dùng' : 'Đã cập nhật phân công')
    setEditing(null); rows.reload()
  }

  const remove = async () => {
    setBusy(true)
    try { await api.facilityAssignments.remove(removing.id); toast('Đã gỡ phân công'); setRemoving(null); rows.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'user', header: 'Người dùng', render: (a) => <div className="cell-title">{a.userFullname}</div> },
    { key: 'role', header: 'Vai trò', render: (a) => <Badge tone="blue">{label(a.userRole)}</Badge> },
    { key: 'facility', header: 'Cơ sở kho', render: (a) => a.facilityName },
    { key: 'actions', header: '', className: 'actions', render: (a) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(a)}><Pencil size={14} /> Đổi</Button>
        <Button size="sm" variant="danger-outline" onClick={() => setRemoving(a)}><UserMinus size={14} /> Gỡ bỏ</Button>
      </>) },
  ]

  return (
    <>
      <PageHeader title="Phân công cơ sở" subtitle="Phân công nhân viên và quản lý cho các cơ sở."
        actions={<Button onClick={() => openForm()}><Plus size={18} /> Phân công người dùng</Button>} />
      <div className="toolbar">
        <Select label="Cơ sở kho" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
          <option value="">Tất cả cơ sở</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </div>
      {rows.loading ? <LoadingState /> : rows.error ? <ErrorState error={rows.error} onRetry={rows.reload} /> :
        <DataTable columns={columns} rows={rows.data} rowKey="id" empty={<EmptyState title="Chưa có phân công" message="Hãy phân công nhân viên hoặc quản lý vào một cơ sở." />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'Phân công người dùng' : 'Đổi phân công'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2">
          <Select label="Người dùng" required hint="Chỉ gồm nhân viên và quản lý cơ sở đang hoạt động" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} disabled={editing !== 'new'}>
            <option value="">Chọn người dùng</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.fullname} ({label(u.role)})</option>)}
          </Select>
        </div>
        <div className="span-2">
          <Select label="Cơ sở kho" required value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })}>
            <option value="">Chọn cơ sở</option>
            {facilities.data?.filter((f) => f.status === 'ACTIVE').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
      </FormModal>

      <ConfirmDialog open={!!removing} danger loading={busy} title="Gỡ phân công" confirmText="Gỡ bỏ"
        message={`Remove ${removing?.userFullname} from ${removing?.facilityName}?`} onConfirm={remove} onClose={() => setRemoving(null)} />
    </>
  )
}

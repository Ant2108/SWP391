import { useState } from 'react'
import { unitTypeLabel, label } from '../../utils/format.js'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { canWrite } from '../../utils/permissions.js'
import { api, UNIT_STATUSES, NEXT_UNIT_STATUSES } from '../../api/client.js'

const EMPTY = { facilityId: '', unitTypeId: '', unitCode: '', floor: '', location: '' }

export default function StorageUnits() {
  const toast = useToast()
  const { user } = useAuth()
  const roleCanEdit = canWrite(user?.role, 'storageUnits')
  const mine = (u) => roleCanEdit && !!user?.facilityId && u.facilityId === user.facilityId // chỉ thao tác trên ô của cơ sở mình quản lý
  const facilities = useAsync(() => api.facilities.list())
  const [filters, setFilters] = useState({ facilityId: '', status: '' })
  const units = useAsync(() => api.storageUnits.search(filters), [filters.facilityId, filters.status])

  const facName = (id) => facilities.data?.find((f) => f.id === id)?.name || `#${id}`
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const formTypes = useAsync(() => (form.facilityId ? api.unitTypes.listByFacility(form.facilityId) : Promise.resolve([])), [form.facilityId])
  const [changing, setChanging] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const openForm = (u) => {
    if (!user?.facilityId) { toast('Chưa xác định được cơ sở bạn quản lý. Hãy tải lại trang (hoặc đăng nhập lại) rồi thử lại.', 'error'); return }
    setEditing(u || 'new')
    setForm(u ? { facilityId: String(u.facilityId), unitTypeId: String(u.unitTypeId), unitCode: u.unitCode, floor: u.floor || '', location: u.location || '' } : { ...EMPTY, facilityId: String(user.facilityId) })
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    const body = { facilityId: Number(form.facilityId), unitTypeId: Number(form.unitTypeId), unitCode: form.unitCode, floor: orNull(form.floor), location: orNull(form.location) }
    if (editing === 'new') await api.storageUnits.create(body)
    else await api.storageUnits.update(editing.id, body)
    toast(editing === 'new' ? 'Đã tạo ô kho' : 'Đã cập nhật ô kho')
    setEditing(null); units.reload()
  }

  const changeStatus = async (u, status) => {
    setChanging(u.id)
    try { await api.storageUnits.changeStatus(u.id, status); toast(`Ô ${u.unitCode} đã chuyển sang: ${label(status)}`); units.reload() }
    catch (e) { toast(e.message, 'error') } finally { setChanging(null) }
  }

  const columns = [
    { key: 'code', header: 'Ô kho', render: (u) => <><div className="cell-title">{u.unitCode}</div><div className="cell-sub">{[u.floor && `Tầng ${u.floor}`, u.location && `Vị trí ${u.location}`].filter(Boolean).join(' · ') || '—'}</div></> },
    { key: 'facility', header: 'Cơ sở kho', render: (u) => facName(u.facilityId) },
    { key: 'type', header: 'Loại', render: (u) => unitTypeLabel(u.unitTypeName) },
    { key: 'status', header: 'Trạng thái', render: (u) => <Badge status={u.status} /> },
    { key: 'change', header: 'Đổi trạng thái', render: (u) => (
      <select className="input" style={{ minHeight: 36, padding: '6px 34px 6px 10px', fontSize: 14, width: 150 }} aria-label={`Trạng thái của ${u.unitCode}`}
        value={u.status} disabled={changing === u.id || !mine(u)} onChange={(e) => changeStatus(u, e.target.value)}>
        {[u.status, ...(NEXT_UNIT_STATUSES[u.status] || [])].map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>) },
    { key: 'actions', header: '', className: 'actions', render: (u) => mine(u) && (<><Button size="sm" variant="secondary" onClick={() => openForm(u)}><Pencil size={14} /> Sửa</Button><Button size="sm" variant="danger-outline" onClick={() => setDeleting(u)}><Trash2 size={14} /> Xóa</Button></>) },
  ]

  return (
    <>
      <PageHeader title="Ô kho" subtitle="Theo dõi và quản lý từng ô kho."
        actions={roleCanEdit && <Button onClick={() => openForm()}><Plus size={18} /> Thêm ô kho</Button>} />
      <div className="toolbar">
        <Select label="Cơ sở kho" value={filters.facilityId} onChange={(e) => setFilters({ ...filters, facilityId: e.target.value })}>
          <option value="">Tất cả cơ sở</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select label="Trạng thái" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tất cả trạng thái</option>
          {UNIT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
      </div>
      {units.loading ? <LoadingState /> : units.error ? <ErrorState error={units.error} onRetry={units.reload} /> :
        <DataTable columns={columns} rows={units.data} rowKey="id" empty={<EmptyState title="Chưa có ô kho" message="Thử đổi bộ lọc hoặc thêm ô kho mới." />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'Thêm ô kho' : 'Sửa ô kho'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Cơ sở quản lý" value={user?.facilityName || ''} readOnly disabled hint="Cố định theo cơ sở bạn được phân công." /></div>
        <Select label="Loại kho" required value={form.unitTypeId} onChange={set('unitTypeId')} disabled={!form.facilityId}>
          <option value="">Chọn loại kho</option>
          {formTypes.data?.filter((t) => t.active || String(t.id) === form.unitTypeId).map((t) => <option key={t.id} value={t.id}>{unitTypeLabel(t.typeName)}</option>)}
        </Select>
        <div className="span-2"><Input label="Mã ô kho" required maxLength={50} value={form.unitCode} onChange={set('unitCode')} /></div>
        <Input label="Tầng" maxLength={50} value={form.floor} onChange={set('floor')} />
        <Input label="Vị trí" maxLength={150} value={form.location} onChange={set('location')} />
      </FormModal>
      <ConfirmDialog open={!!deleting} danger loading={busy} title="Xóa ô kho" confirmText="Xóa"
        message={`Xóa hẳn ô kho "${deleting?.unitCode}"? Ô đã từng được thuê hoặc đang có hợp đồng sẽ không xóa được.`}
        onConfirm={async () => {
          setBusy(true)
          try { await api.storageUnits.remove(deleting.id); toast('Đã xóa ô kho'); setDeleting(null); units.reload() }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }} onClose={() => setDeleting(null)} />
    </>
  )
}

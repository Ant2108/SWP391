import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, UNIT_STATUSES } from '../../api/client.js'

const EMPTY = { facilityId: '', unitTypeId: '', unitCode: '', floor: '', location: '' }

export default function StorageUnits() {
  const toast = useToast()
  const facilities = useAsync(() => api.facilities.list())
  const [filters, setFilters] = useState({ facilityId: '', status: '' })
  const units = useAsync(() => api.storageUnits.search(filters), [filters.facilityId, filters.status])

  const facName = (id) => facilities.data?.find((f) => f.id === id)?.name || `#${id}`
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const formTypes = useAsync(() => (form.facilityId ? api.unitTypes.listByFacility(form.facilityId) : Promise.resolve([])), [form.facilityId])
  const [changing, setChanging] = useState(null)

  const openForm = (u) => {
    setEditing(u || 'new')
    setForm(u ? { facilityId: String(u.facilityId), unitTypeId: String(u.unitTypeId), unitCode: u.unitCode, floor: u.floor || '', location: u.location || '' } : EMPTY)
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    const body = { facilityId: Number(form.facilityId), unitTypeId: Number(form.unitTypeId), unitCode: form.unitCode, floor: orNull(form.floor), location: orNull(form.location) }
    if (editing === 'new') await api.storageUnits.create(body)
    else await api.storageUnits.update(editing.id, body)
    toast(editing === 'new' ? 'Storage unit created' : 'Storage unit updated')
    setEditing(null); units.reload()
  }

  const changeStatus = async (u, status) => {
    setChanging(u.id)
    try { await api.storageUnits.changeStatus(u.id, status); toast(`${u.unitCode} is now ${status.toLowerCase()}`); units.reload() }
    catch (e) { toast(e.message, 'error') } finally { setChanging(null) }
  }

  const columns = [
    { key: 'code', header: 'Unit', render: (u) => <><div className="cell-title">{u.unitCode}</div><div className="cell-sub">{[u.floor, u.location].filter(Boolean).join(' · ') || '—'}</div></> },
    { key: 'facility', header: 'Facility', render: (u) => facName(u.facilityId) },
    { key: 'type', header: 'Type', render: (u) => u.unitTypeName },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.status} /> },
    { key: 'change', header: 'Change status', render: (u) => (
      <select className="input" style={{ minHeight: 36, padding: '6px 34px 6px 10px', fontSize: 14, width: 150 }} aria-label={`Status of ${u.unitCode}`}
        value={u.status} disabled={changing === u.id} onChange={(e) => changeStatus(u, e.target.value)}>
        {UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>) },
    { key: 'actions', header: '', className: 'actions', render: (u) => <Button size="sm" variant="secondary" onClick={() => openForm(u)}><Pencil size={14} /> Edit</Button> },
  ]

  return (
    <>
      <PageHeader title="Storage Units" subtitle="Track and manage every unit."
        actions={<Button onClick={() => openForm()}><Plus size={18} /> New unit</Button>} />
      <div className="toolbar">
        <Select label="Facility" value={filters.facilityId} onChange={(e) => setFilters({ ...filters, facilityId: e.target.value })}>
          <option value="">All facilities</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      {units.loading ? <LoadingState /> : units.error ? <ErrorState error={units.error} onRetry={units.reload} /> :
        <DataTable columns={columns} rows={units.data} rowKey="id" empty={<EmptyState title="No storage units" message="Try different filters or add a new unit." />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'New storage unit' : 'Edit storage unit'} onClose={() => setEditing(null)} onSubmit={save}>
        <Select label="Facility" required value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value, unitTypeId: '' })}>
          <option value="">Select facility</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select label="Unit type" required value={form.unitTypeId} onChange={set('unitTypeId')} disabled={!form.facilityId}>
          <option value="">Select unit type</option>
          {formTypes.data?.filter((t) => t.active || String(t.id) === form.unitTypeId).map((t) => <option key={t.id} value={t.id}>{t.typeName}</option>)}
        </Select>
        <div className="span-2"><Input label="Unit code" required maxLength={50} value={form.unitCode} onChange={set('unitCode')} /></div>
        <Input label="Floor" maxLength={50} value={form.floor} onChange={set('floor')} />
        <Input label="Location" maxLength={150} value={form.location} onChange={set('location')} />
      </FormModal>
    </>
  )
}

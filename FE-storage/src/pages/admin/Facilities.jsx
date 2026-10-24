import { useState } from 'react'
import { Plus, Pencil, Ban } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { canWrite } from '../../utils/permissions.js'
import { api } from '../../api/client.js'
import { STOCK_OPTIONS, stockOf } from '../../utils/facility.js'

const EMPTY = { name: '', address: '', phone: '', stockStatus: 'AVAILABLE' }

export default function Facilities() {
  const toast = useToast()
  const { user } = useAuth()
  const canEdit = canWrite(user?.role, 'facilities')
  const [status, setStatus] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.facilities.list(), [])
  const [editing, setEditing] = useState(null) // null | 'new' | facility
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [busy, setBusy] = useState(false)

  const openForm = (f) => {
    setEditing(f || 'new')
    setForm(f ? { name: f.name, address: f.address, phone: f.phone || '', stockStatus: f.stockStatus || 'AVAILABLE' } : EMPTY)
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })


  const save = async () => {
    const body = { ...form, phone: orNull(form.phone) }
    if (editing === 'new') await api.facilities.create(body)
    else await api.facilities.update(editing.id, body)
    toast(editing === 'new' ? 'Facility created' : 'Facility updated')
    setEditing(null); reload()
  }

  const disable = async () => {
    setBusy(true)
    try { await api.facilities.disable(disabling.id); toast('Facility disabled'); setDisabling(null); reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'name', header: 'Facility', render: (f) => <><div className="cell-title">{f.name}</div><div className="cell-sub">{f.address}</div></> },
    { key: 'phone', header: 'Phone', render: (f) => f.phone || '—' },
    { key: 'stock', header: 'Stock', render: (f) => <Badge tone={stockOf(f).tone}>{stockOf(f).label}</Badge> },
    { key: 'status', header: 'Status', render: (f) => <Badge status={f.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (f) => canEdit && (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(f)}><Pencil size={14} /> Edit</Button>
        {f.status === 'ACTIVE' && <Button size="sm" variant="danger-outline" onClick={() => setDisabling(f)}><Ban size={14} /> Disable</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Facilities" subtitle="Manage storage locations."
        actions={canEdit && <Button onClick={() => openForm()}><Plus size={18} /> New facility</Button>} />
      <div className="toolbar">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
        </Select>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
        <DataTable columns={columns} rows={data.filter((f) => !status || f.status === status)} rowKey="id" empty={<EmptyState title="No facilities" message="Create your first facility to get started." />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'New facility' : 'Edit facility'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Facility name" required maxLength={150} value={form.name} onChange={set('name')} /></div>
        <div className="span-2"><Input label="Address" required maxLength={300} value={form.address} onChange={set('address')} /></div>
        <div className="span-2"><Input label="Phone" maxLength={20} value={form.phone} onChange={set('phone')} /></div>
        <div className="span-2">
          <Select label="Availability" hint="Shown to customers on the facility card and details page." value={form.stockStatus} onChange={set('stockStatus')}>
            {STOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      </FormModal>

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Disable facility" confirmText="Disable"
        message={`Disable "${disabling?.name}"? It will be marked inactive.`} onConfirm={disable} onClose={() => setDisabling(null)} />
    </>
  )
}

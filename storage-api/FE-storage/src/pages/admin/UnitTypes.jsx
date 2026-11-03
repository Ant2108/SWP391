import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Textarea, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull, numOrNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { canWrite } from '../../utils/permissions.js'
import UnitImage from '../../components/UnitImage.jsx'
import { api } from '../../api/client.js'

const EMPTY = { typeName: '', width: '', length: '', height: '', sizeDescription: '', description: '', imageUrl: '' }

export default function UnitTypes() {
  const toast = useToast()
  const { user } = useAuth()
  const canEdit = canWrite(user?.role, 'unitTypes')
  const facilities = useAsync(() => api.facilities.list())
  const [facilityId, setFacilityId] = useState('')
  useEffect(() => { if (!facilityId && facilities.data?.length) setFacilityId(String(facilities.data[0].id)) }, [facilities.data, facilityId])

  const types = useAsync(() => (facilityId ? api.unitTypes.listByFacility(facilityId) : Promise.resolve([])), [facilityId])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const openForm = (t) => {
    setEditing(t || 'new')
    setForm(t ? { typeName: t.typeName, width: t.width ?? '', length: t.length ?? '', height: t.height ?? '', sizeDescription: t.sizeDescription || '', description: t.description || '', imageUrl: t.imageUrl || '' } : EMPTY)
  }
  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Image must be at most 5MB', 'error'); return }
    setUploading(true)
    try { const { url } = await api.files.uploadImage(file); setForm((f) => ({ ...f, imageUrl: url })); toast('Image uploaded') }
    catch (err) { toast(err.message, 'error') } finally { setUploading(false) }
  }

  const save = async () => {
    const body = {
      facilityId: Number(facilityId), typeName: form.typeName,
      width: numOrNull(form.width), length: numOrNull(form.length), height: numOrNull(form.height),
      sizeDescription: orNull(form.sizeDescription), description: orNull(form.description), imageUrl: orNull(form.imageUrl.trim()),
    }
    if (editing === 'new') await api.unitTypes.create(body)
    else await api.unitTypes.update(editing.id, body)
    toast(editing === 'new' ? 'Unit type created' : 'Unit type updated')
    setEditing(null); types.reload()
  }
  const disable = async () => {
    setBusy(true)
    try { await api.unitTypes.disable(disabling.id); toast('Unit type disabled'); setDisabling(null); types.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'image', header: '', render: (t) => <div style={{ width: 72 }}><UnitImage imageUrl={t.imageUrl} name={t.typeName} width={t.width} length={t.length} height={t.height} style={{ borderRadius: 8 }} /></div> },
    { key: 'name', header: 'Type', render: (t) => <><div className="cell-title">{t.typeName}</div>{t.description && <div className="cell-sub">{t.description}</div>}</> },
    { key: 'size', header: 'Size', render: (t) => t.sizeDescription || [t.width, t.length, t.height].filter((v) => v != null).join(' × ') || '—' },
    { key: 'status', header: 'Status', render: (t) => <Badge status={t.active ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', header: '', className: 'actions', render: (t) => canEdit && (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(t)}><Pencil size={14} /> Edit</Button>
        {t.active && <Button size="sm" variant="danger-outline" onClick={() => setDisabling(t)}><Ban size={14} /> Disable</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Unit Types" subtitle="Define unit sizes for each facility."
        actions={canEdit && <Button onClick={() => openForm()} disabled={!facilityId}><Plus size={18} /> New unit type</Button>} />
      {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
        !facilities.data.length ? <EmptyState title="No facilities yet" message="Create a facility before adding unit types." /> : (
          <>
            <div className="toolbar">
              <Select label="Facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                {facilities.data.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </div>
            {types.loading ? <LoadingState /> : types.error ? <ErrorState error={types.error} onRetry={types.reload} /> :
              <DataTable columns={columns} rows={types.data} rowKey="id" empty={<EmptyState title="No unit types" message="Add a unit type for this facility." />} />}
          </>
        )}

      <FormModal open={!!editing} title={editing === 'new' ? 'New unit type' : 'Edit unit type'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Type name" required maxLength={100} value={form.typeName} onChange={set('typeName')} /></div>
        <Input label="Width (m)" type="number" min="0" step="0.01" value={form.width} onChange={set('width')} />
        <Input label="Length (m)" type="number" min="0" step="0.01" value={form.length} onChange={set('length')} />
        <Input label="Height (m)" type="number" min="0" step="0.01" value={form.height} onChange={set('height')} />
        <div className="span-2">
          <Input label="Image" placeholder="Upload a file below or paste a link (https://...)" hint="Optional. Leave empty to use the default illustration." value={form.imageUrl} onChange={set('imageUrl')} />
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'Uploading…' : 'Upload image'}
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
            </label>
            {form.imageUrl && <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, imageUrl: '' })}>Remove</Button>}
            <span className="field-hint">JPEG, PNG, GIF or WebP, up to 5MB</span>
          </div>
          {form.imageUrl.trim() && <div style={{ marginTop: 10, maxWidth: 260 }}><UnitImage imageUrl={form.imageUrl.trim()} name={form.typeName} /></div>}
        </div>
        <Input label="Size description" maxLength={150} value={form.sizeDescription} onChange={set('sizeDescription')} />
        <div className="span-2"><Textarea label="Description" maxLength={500} value={form.description} onChange={set('description')} /></div>
      </FormModal>

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Disable unit type" confirmText="Disable"
        message={`Disable "${disabling?.typeName}"?`} onConfirm={disable} onClose={() => setDisabling(null)} />
    </>
  )
}

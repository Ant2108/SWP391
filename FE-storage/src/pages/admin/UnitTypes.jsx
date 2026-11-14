import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban, Trash2 } from 'lucide-react'
import { unitTypeLabel } from '../../utils/format.js'
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
  const facilities = useAsync(() => api.facilities.list())
  const [facilityId, setFacilityId] = useState('')
  // Mặc định mở cơ sở mình quản lý; quản lý vẫn xem được cơ sở khác nhưng chỉ sửa được cơ sở của mình.
  useEffect(() => {
    if (facilityId || !facilities.data?.length) return
    const own = facilities.data.find((f) => f.id === user?.facilityId)
    setFacilityId(String((own || facilities.data[0]).id))
  }, [facilities.data, facilityId, user?.facilityId])
  const roleCanEdit = canWrite(user?.role, 'unitTypes')
  const canEdit = roleCanEdit && Number(facilityId) === user?.facilityId
  const viewingOther = roleCanEdit && !!user?.facilityId && !!facilityId && !canEdit

  const types = useAsync(() => (facilityId ? api.unitTypes.listByFacility(facilityId) : Promise.resolve([])), [facilityId])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const openForm = (t) => {
    if (!canEdit) { toast(user?.facilityId ? 'Bạn chỉ được thêm/sửa loại kho của cơ sở mình quản lý. Hãy chọn đúng cơ sở của bạn.' : 'Chưa xác định được cơ sở bạn quản lý. Hãy tải lại trang (hoặc đăng nhập lại) rồi thử lại.', 'error'); return }
    setEditing(t || 'new')
    setForm(t ? { typeName: t.typeName, width: t.width ?? '', length: t.length ?? '', height: t.height ?? '', sizeDescription: t.sizeDescription || '', description: t.description || '', imageUrl: t.imageUrl || '' } : EMPTY)
  }
  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Ảnh tối đa 5MB', 'error'); return }
    setUploading(true)
    try { const { url } = await api.files.uploadImage(file); setForm((f) => ({ ...f, imageUrl: url })); toast('Đã tải ảnh lên') }
    catch (err) { toast(err.message, 'error') } finally { setUploading(false) }
  }

  const save = async () => {
    for (const [k, label] of [['width', 'Rộng'], ['length', 'Dài'], ['height', 'Cao']]) {
      if (form[k] !== '' && !(Number(form[k]) > 0)) throw new Error(`${label} phải lớn hơn 0.`)
    }
    const body = {
      facilityId: Number(facilityId), typeName: form.typeName,
      width: numOrNull(form.width), length: numOrNull(form.length), height: numOrNull(form.height),
      sizeDescription: orNull(form.sizeDescription), description: orNull(form.description), imageUrl: orNull(form.imageUrl.trim()),
    }
    if (editing === 'new') await api.unitTypes.create(body)
    else await api.unitTypes.update(editing.id, body)
    toast(editing === 'new' ? 'Đã tạo loại kho' : 'Đã cập nhật loại kho')
    setEditing(null); types.reload()
  }
  const disable = async () => {
    setBusy(true)
    try { await api.unitTypes.disable(disabling.id); toast('Đã vô hiệu hóa loại kho'); setDisabling(null); types.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'image', header: '', render: (t) => <div style={{ width: 72 }}><UnitImage imageUrl={t.imageUrl} name={t.typeName} width={t.width} length={t.length} height={t.height} style={{ borderRadius: 8 }} /></div> },
    { key: 'name', header: 'Tên kích cỡ', render: (t) => <><div className="cell-title">{unitTypeLabel(t.typeName)}</div>{t.description && <div className="cell-sub">{t.description}</div>}</> },
    { key: 'size', header: 'Kích thước', render: (t) => t.sizeDescription || [t.width, t.length, t.height].filter((v) => v != null).join(' × ') || '—' },
    { key: 'status', header: 'Trạng thái', render: (t) => <Badge status={t.active ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', header: '', className: 'actions', render: (t) => canEdit && (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(t)}><Pencil size={14} /> Sửa</Button>
        {t.active && <Button size="sm" variant="secondary" onClick={() => setDisabling(t)}><Ban size={14} /> Vô hiệu hóa</Button>}
        <Button size="sm" variant="danger-outline" onClick={() => setDeleting(t)}><Trash2 size={14} /> Xóa</Button>
      </>) },
  ]

  return (
    <>
      <PageHeader title="Loại kho" subtitle="Định nghĩa các kích cỡ kho cho từng cơ sở."
        actions={roleCanEdit && <Button onClick={() => openForm()} disabled={!facilityId}><Plus size={18} /> Thêm loại kho</Button>} />
      {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
        !facilities.data.length ? <EmptyState title="Chưa có cơ sở nào" message="Hãy tạo cơ sở trước khi thêm loại kho." /> : (
          <>
            <div className="toolbar">
              <Select label="Cơ sở kho" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                {facilities.data.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </div>
            {viewingOther && <p className="muted" style={{ margin: '0 0 12px' }}>Bạn đang xem cơ sở khác nên chỉ xem được, không thêm hay sửa. Chọn "{user?.facilityName}" để chỉnh sửa.</p>}
            {types.loading ? <LoadingState /> : types.error ? <ErrorState error={types.error} onRetry={types.reload} /> :
              <DataTable columns={columns} rows={types.data} rowKey="id" empty={<EmptyState title="Chưa có loại kho" message="Hãy thêm loại kho cho cơ sở này." />} />}
          </>
        )}

      <FormModal open={!!editing} title={editing === 'new' ? 'Thêm loại kho' : 'Sửa loại kho'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Cơ sở quản lý" value={user?.facilityName || ''} readOnly disabled hint="Cố định theo cơ sở bạn được phân công." /></div>
        <div className="span-2"><Input label="Tên kích cỡ" required maxLength={100} value={form.typeName} onChange={set('typeName')} /></div>
        <Input label="Chiều rộng (m)" type="number" min="0.01" step="0.01" value={form.width} onChange={set('width')} />
        <Input label="Chiều dài (m)" type="number" min="0.01" step="0.01" value={form.length} onChange={set('length')} />
        <Input label="Chiều cao (m)" type="number" min="0.01" step="0.01" value={form.height} onChange={set('height')} />
        <div className="span-2">
          <Input label="Hình ảnh" placeholder="Tải tệp lên bên dưới hoặc dán đường dẫn (https://...)" hint="Không bắt buộc. Để trống để dùng hình minh họa mặc định." value={form.imageUrl} onChange={set('imageUrl')} />
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'Đang tải lên…' : 'Tải ảnh lên'}
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
            </label>
            {form.imageUrl && <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, imageUrl: '' })}>Gỡ bỏ</Button>}
            <span className="field-hint">JPEG, PNG, GIF hoặc WebP, tối đa 5MB</span>
          </div>
          {form.imageUrl.trim() && <div style={{ marginTop: 10, maxWidth: 260 }}><UnitImage imageUrl={form.imageUrl.trim()} name={form.typeName} /></div>}
        </div>
        <Input label="Mô tả kích cỡ" maxLength={150} value={form.sizeDescription} onChange={set('sizeDescription')} />
        <div className="span-2"><Textarea label="Mô tả" maxLength={500} value={form.description} onChange={set('description')} /></div>
      </FormModal>

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Vô hiệu hóa loại kho" confirmText="Vô hiệu hóa"
        message={`Vô hiệu hóa loại kho "${unitTypeLabel(disabling?.typeName)}"? Khách sẽ không đặt được loại kho này nữa.`} onConfirm={disable} onClose={() => setDisabling(null)} />
      <ConfirmDialog open={!!deleting} danger loading={busy} title="Xóa loại kho" confirmText="Xóa"
        message={`Xóa hẳn loại kho "${unitTypeLabel(deleting?.typeName)}"? Loại kho đã có ô kho hoặc đơn đặt sẽ không xóa được, khi đó hãy dùng Vô hiệu hóa.`}
        onConfirm={async () => {
          setBusy(true)
          try { await api.unitTypes.remove(deleting.id); toast('Đã xóa loại kho'); setDeleting(null); types.reload() }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }} onClose={() => setDeleting(null)} />
    </>
  )
}

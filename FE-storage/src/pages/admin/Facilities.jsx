import { useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw, Trash2 } from 'lucide-react'
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
  const canCreate = canWrite(user?.role, 'facilitiesCreate') // tạo mới + vô hiệu hóa: chỉ Business Manager
  const canEdit = canWrite(user?.role, 'facilitiesEdit')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  // Quản lý cơ sở chỉ được sửa đúng cơ sở mình phụ trách; các cơ sở khác chỉ xem.
  const mine = (f) => user?.role !== 'FACILITY_MANAGER' || f.id === user?.facilityId
  const { data, loading, error, reload } = useAsync(() => api.facilities.list(), [])
  const [editing, setEditing] = useState(null) // null | 'new' | facility
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const openForm = (f) => {
    setEditing(f || 'new')
    setForm(f ? { name: f.name, address: f.address, phone: f.phone || '', stockStatus: f.stockStatus || 'AVAILABLE' } : EMPTY)
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  const matches = (f) => !q.trim() || norm(f.name).includes(norm(q.trim()))

  const save = async () => {
    const body = { ...form, phone: orNull(form.phone) }
    if (editing === 'new') await api.facilities.create(body)
    else await api.facilities.update(editing.id, body)
    toast(editing === 'new' ? 'Đã tạo cơ sở' : 'Đã cập nhật cơ sở')
    setEditing(null); reload()
  }

  const disable = async () => {
    setBusy(true)
    try { await api.facilities.disable(disabling.id); toast('Đã vô hiệu hóa cơ sở'); setDisabling(null); reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const enable = async (f) => {
    setBusy(true)
    try { await api.facilities.enable(f.id); toast('Đã kích hoạt cơ sở'); reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const columns = [
    { key: 'name', header: 'Cơ sở kho', render: (f) => <><div className="cell-title">{f.name}</div><div className="cell-sub">{f.address}</div></> },
    { key: 'phone', header: 'Số điện thoại', render: (f) => f.phone || '—' },
    { key: 'stock', header: 'Tình trạng kho', render: (f) => <Badge tone={stockOf(f).tone}>{stockOf(f).label}</Badge> },
    { key: 'status', header: 'Trạng thái', render: (f) => <Badge status={f.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (f) => canEdit && mine(f) && (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(f)}><Pencil size={14} /> Sửa</Button>
        {canCreate && f.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setDisabling(f)}><Ban size={14} /> Vô hiệu hóa</Button>}
        {canCreate && f.status === 'INACTIVE' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => enable(f)}><RotateCcw size={14} /> Kích hoạt</Button>}
        {canCreate && <Button size="sm" variant="danger-outline" onClick={() => setDeleting(f)}><Trash2 size={14} /> Xóa</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Cơ sở kho" subtitle="Quản lý các cơ sở kho."
        actions={canCreate && <Button onClick={() => openForm()}><Plus size={18} /> Thêm cơ sở</Button>} />
      <div className="toolbar">
        <div style={{ flex: '1 1 320px', maxWidth: 480 }}>
          <Input label="Tìm kiếm" type="search" placeholder="Nhập tên cơ sở kho…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option>
        </Select>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
        <DataTable columns={columns} rows={data.filter((f) => (!status || f.status === status) && matches(f))} rowKey="id" empty={<EmptyState title={q ? 'Không tìm thấy cơ sở' : 'Chưa có cơ sở'} message={q ? 'Thử từ khóa khác hoặc xóa bộ lọc.' : 'Hãy tạo cơ sở đầu tiên để bắt đầu.'} />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'Thêm cơ sở' : 'Sửa cơ sở'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Tên cơ sở" required maxLength={150} value={form.name} onChange={set('name')} /></div>
        <div className="span-2"><Input label="Địa chỉ" required maxLength={300} value={form.address} onChange={set('address')} /></div>
        <div className="span-2"><Input label="Số điện thoại" maxLength={20} value={form.phone} onChange={set('phone')} /></div>
        <div className="span-2">
          <Select label="Tình trạng còn kho" hint="Hiển thị cho khách ở thẻ cơ sở và trang chi tiết." value={form.stockStatus} onChange={set('stockStatus')}>
            {STOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      </FormModal>

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Vô hiệu hóa cơ sở" confirmText="Vô hiệu hóa"
        message={`Vô hiệu hóa cơ sở "${disabling?.name}"? Cơ sở sẽ ngừng hoạt động và khách không thấy nữa.`} onConfirm={disable} onClose={() => setDisabling(null)} />
      <ConfirmDialog open={!!deleting} danger loading={busy} title="Xóa cơ sở" confirmText="Xóa"
        message={`Xóa hẳn cơ sở "${deleting?.name}"? Cơ sở đã có loại kho, ô kho, nhân viên hoặc đơn đặt sẽ không xóa được, khi đó hãy dùng Vô hiệu hóa.`}
        onConfirm={async () => {
          setBusy(true)
          try { await api.facilities.remove(deleting.id); toast('Đã xóa cơ sở'); setDeleting(null); reload() }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }} onClose={() => setDeleting(null)} />
    </>
  )
}

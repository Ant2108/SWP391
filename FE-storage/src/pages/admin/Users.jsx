import { useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { label } from '../../utils/format.js'

const EMPTY = { fullname: '', email: '', phone: '', password: '', role: 'CUSTOMER' }

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
    toast(editing === 'new' ? 'Đã tạo người dùng' : 'Đã cập nhật người dùng')
    setEditing(null); users.reload()
  }

  const run = async (u, fn, msg) => {
    setBusyId(u.id)
    try { await fn(); toast(msg); users.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusyId(null) }
  }

  const columns = [
    { key: 'name', header: 'Người dùng', render: (u) => <><div className="cell-title">{u.fullname}</div><div className="cell-sub">{u.email}</div></> },
    { key: 'phone', header: 'Số điện thoại', render: (u) => u.phone || '—' },
    { key: 'role', header: 'Vai trò', render: (u) => (
      <select className="input" style={{ minHeight: 36, padding: '6px 34px 6px 10px', fontSize: 14, width: 180 }} aria-label={`Vai trò của ${u.email}`}
        value={u.role} disabled={busyId === u.id || !roles.data || u.role === 'SYSTEM_ADMIN'}
        title={u.role === 'SYSTEM_ADMIN' ? 'Không thể đổi vai trò của tài khoản quản trị hệ thống' : undefined}
        onChange={(e) => run(u, () => api.users.updateRole(u.id, e.target.value), `${u.email} đã chuyển sang vai trò: ${label(e.target.value)}`)}>
        {(roles.data || [u.role]).map((r) => <option key={r} value={r}>{label(r)}</option>)}
      </select>) },
    { key: 'status', header: 'Trạng thái', render: (u) => <Badge status={u.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (u) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => openForm(u)}><Pencil size={14} /> Sửa</Button>
        {u.role === 'SYSTEM_ADMIN'
          ? null /* tài khoản System Admin không được vô hiệu hóa (BE cũng chặn) */
          : u.status === 'ACTIVE'
          ? <Button size="sm" variant="danger-outline" onClick={() => setDeactivating(u)}><Ban size={14} /> Ngừng hoạt động</Button>
          : <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => run(u, () => api.users.updateStatus(u.id, 'ACTIVE'), 'Đã kích hoạt lại người dùng')}><RotateCcw size={14} /> Kích hoạt</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Người dùng" subtitle="Quản lý tài khoản và vai trò." actions={<Button onClick={() => openForm()}><Plus size={18} /> Thêm người dùng</Button>} />
      <div className="toolbar">
        <Select label="Vai trò" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Tất cả vai trò</option>
          {roles.data?.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </Select>
      </div>
      {users.loading ? <LoadingState /> : users.error ? <ErrorState error={users.error} onRetry={users.reload} /> :
        <DataTable columns={columns} rows={users.data.filter((u) => !role || u.role === role)} rowKey="id" empty={<EmptyState title="Chưa có người dùng" />} />}

      <FormModal open={!!editing} title={editing === 'new' ? 'Thêm người dùng' : 'Sửa người dùng'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2"><Input label="Họ và tên" required minLength={2} maxLength={100} value={form.fullname} onChange={set('fullname')} /></div>
        <div className="span-2"><Input label="Email" type="email" required value={form.email} onChange={set('email')} /></div>
        <div className="span-2"><Input label="Số điện thoại" required hint="10 chữ số, bắt đầu bằng 0" value={form.phone} onChange={set('phone')} /></div>
        {editing === 'new' && <>
          <Input label="Mật khẩu" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <Select label="Vai trò" value={form.role} onChange={set('role')}>
            {(roles.data || ['CUSTOMER']).map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </Select>
        </>}
      </FormModal>

      <ConfirmDialog open={!!deactivating} danger loading={busyId === deactivating?.id} title="Ngừng hoạt động người dùng" confirmText="Ngừng hoạt động"
        message={`Ngừng hoạt động tài khoản ${deactivating?.email}? Người này sẽ không đăng nhập được nữa.`}
        onConfirm={async () => { const u = deactivating; await run(u, () => api.users.remove(u.id), 'Đã ngừng hoạt động người dùng'); setDeactivating(null) }}
        onClose={() => setDeactivating(null)} />
    </>
  )
}

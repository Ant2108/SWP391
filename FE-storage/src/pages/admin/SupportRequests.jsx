import { useState } from 'react'
import { UserPlus, Play, CheckCircle2, Lock, Eye } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Select, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import SupportThread from '../../components/SupportThread.jsx'
import { api, SUPPORT_STATUSES, SUPPORT_PRIORITIES } from '../../api/client.js'
import { fmtDateTime, label } from '../../utils/format.js'

const actionsRow = { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }

// Staff và manager của cơ sở trả lời khách và xử lý yêu cầu (IN_PROGRESS -> RESOLVED) mà không cần được gán trước.
// Manager có thể gán một staff phụ trách và đóng yêu cầu đã RESOLVED.
export default function SupportRequests() {
  const { user } = useAuth()
  const toast = useToast()
  const isManager = user?.role === 'FACILITY_MANAGER'
  const isStaff = user?.role === 'FACILITY_STAFF'

  const [filters, setFilters] = useState({ status: '', priority: '', mine: false })
  const list = useAsync(
    () => api.supportRequests.list({ status: filters.status, priority: filters.priority, staffId: filters.mine ? user?.userId : undefined }),
    [filters.status, filters.priority, filters.mine])

  const [assigning, setAssigning] = useState(null)
  const [staffId, setStaffId] = useState('')
  const [viewing, setViewing] = useState(null)
  const [busy, setBusy] = useState(null)
  const staffList = useAsync(
    () => (assigning ? api.appointments.staff() : Promise.resolve([])), [assigning?.id])
  const staffOptions = staffList.data || []

  const sendReply = async (message) => {
    const updated = await api.supportRequests.reply(viewing.id, message)
    setViewing(updated); list.reload()
    toast('Đã gửi phản hồi cho khách')
  }

  const changeStatus = async (r, status, msg) => {
    setBusy(r.id)
    try { await api.supportRequests.setStatus(r.id, status); toast(msg); list.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(null) }
  }

  const assign = async () => {
    if (!staffId) throw new Error('Vui lòng chọn nhân viên')
    await api.supportRequests.assign(assigning.id, Number(staffId))
    toast('Đã gán nhân viên'); setAssigning(null); list.reload()
  }

  const columns = [
    { key: 'req', header: 'Yêu cầu', render: (r) => <><div className="cell-title">{r.title}</div><div className="cell-sub">{label(r.supportType)} · Ô {r.unitCode} · {r.facilityName}</div></> },
    { key: 'customer', header: 'Khách hàng', render: (r) => <><div>{r.customerName}</div><div className="cell-sub">{fmtDateTime(r.createdAt)}</div></> },
    { key: 'priority', header: 'Mức ưu tiên', render: (r) => <Badge status={r.priority} /> },
    { key: 'status', header: 'Trạng thái', render: (r) => <Badge status={r.status} /> },
    { key: 'staff', header: 'Nhân viên', render: (r) => r.assignedStaffName || <span className="muted">Chưa gán</span> },
    { key: 'actions', header: '', className: 'actions', render: (r) => {
      return (
        <div style={actionsRow}>
          <Button size="sm" variant="secondary" onClick={() => setViewing(r)}><Eye size={14} /> Xem và trả lời</Button>
          {isManager && (r.status === 'OPEN' || r.status === 'IN_PROGRESS') &&
            <Button size="sm" variant="secondary" onClick={() => { setAssigning(r); setStaffId(r.assignedStaffId || '') }}><UserPlus size={14} /> {r.assignedStaffId ? 'Reassign' : 'Gán'}</Button>}
          {(isStaff || isManager) && r.status === 'OPEN' &&
            <Button size="sm" loading={busy === r.id} onClick={() => changeStatus(r, 'IN_PROGRESS', 'Đã bắt đầu xử lý')}><Play size={14} /> Bắt đầu</Button>}
          {(isStaff || isManager) && r.status === 'IN_PROGRESS' &&
            <Button size="sm" loading={busy === r.id} onClick={() => changeStatus(r, 'RESOLVED', 'Đã đánh dấu đã giải quyết. Khách hàng đã được thông báo.')}><CheckCircle2 size={14} /> Giải quyết</Button>}
          {isManager && r.status === 'RESOLVED' &&
            <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => changeStatus(r, 'CLOSED', 'Đã đóng yêu cầu')}><Lock size={14} /> Đóng</Button>}
        </div>
      )
    } },
  ]

  return (
    <>
      <PageHeader title="Yêu cầu hỗ trợ"
        subtitle={isStaff || isManager ? 'Yêu cầu của khách tại cơ sở của bạn. Có thể trả lời trực tiếp (không cần gán), bắt đầu xử lý và đánh dấu đã giải quyết.' : 'Tất cả yêu cầu hỗ trợ (chỉ xem).'} />
      <div className="toolbar">
        <Select label="Trạng thái" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tất cả trạng thái</option>
          {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select label="Mức ưu tiên" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">Mọi mức ưu tiên</option>
          {SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </Select>
        {isStaff && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> Assigned to me
          </label>)}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id" empty={<EmptyState title="Chưa có yêu cầu hỗ trợ" message="Hãy thử bộ lọc khác." />} />}

      <FormModal open={!!assigning} title="Gán nhân viên" onClose={() => setAssigning(null)} onSubmit={assign} submitText="Gán">
        <div className="span-2">
          <Select label="Nhân viên" required value={staffId} onChange={(e) => setStaffId(e.target.value)}
            hint={!staffList.loading && !staffOptions.length ? 'Cơ sở này chưa có nhân viên nào được phân công.' : undefined}>
            <option value="">Chọn nhân viên</option>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.fullname}</option>)}
          </Select>
        </div>
      </FormModal>

      <Modal wide open={!!viewing} title={viewing?.title || ''} onClose={() => setViewing(null)}>
        {viewing && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge status={viewing.status} /><Badge status={viewing.priority} /><span className="muted small">{label(viewing.supportType)}</span></div>
            <p>{viewing.description || <span className="muted">Không có mô tả.</span>}</p>
            <div className="muted small">Customer: {viewing.customerName} · Unit {viewing.unitCode} · {viewing.facilityName}</div>
            <div className="muted small">Sent {fmtDateTime(viewing.createdAt)}{viewing.resolvedAt ? ` · Resolved ${fmtDateTime(viewing.resolvedAt)}` : ''}</div>
            <div className="muted small">{viewing.assignedStaffName ? `Handled by ${viewing.assignedStaffName}` : 'Chưa có ai phụ trách: nhân viên đầu tiên trả lời sẽ nhận yêu cầu.'}</div>
            <SupportThread replies={viewing.replies} canReply={(isStaff || isManager) && viewing.status !== 'CLOSED'} onSend={sendReply}
              placeholder="Khách hàng được thông báo và xem phản hồi của bạn trong mục Yêu cầu hỗ trợ của tôi." />
          </div>
        )}
      </Modal>
    </>
  )
}

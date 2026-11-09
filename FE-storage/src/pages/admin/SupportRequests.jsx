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
    toast('Reply sent to the customer')
  }

  const changeStatus = async (r, status, msg) => {
    setBusy(r.id)
    try { await api.supportRequests.setStatus(r.id, status); toast(msg); list.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(null) }
  }

  const assign = async () => {
    if (!staffId) throw new Error('Please choose a staff member')
    await api.supportRequests.assign(assigning.id, Number(staffId))
    toast('Staff assigned'); setAssigning(null); list.reload()
  }

  const columns = [
    { key: 'req', header: 'Request', render: (r) => <><div className="cell-title">{r.title}</div><div className="cell-sub">{label(r.supportType)} · Unit {r.unitCode} · {r.facilityName}</div></> },
    { key: 'customer', header: 'Customer', render: (r) => <><div>{r.customerName}</div><div className="cell-sub">{fmtDateTime(r.createdAt)}</div></> },
    { key: 'priority', header: 'Priority', render: (r) => <Badge status={r.priority} /> },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    { key: 'staff', header: 'Staff', render: (r) => r.assignedStaffName || <span className="muted">Not assigned</span> },
    { key: 'actions', header: '', className: 'actions', render: (r) => {
      return (
        <div style={actionsRow}>
          <Button size="sm" variant="secondary" onClick={() => setViewing(r)}><Eye size={14} /> View &amp; reply</Button>
          {isManager && (r.status === 'OPEN' || r.status === 'IN_PROGRESS') &&
            <Button size="sm" variant="secondary" onClick={() => { setAssigning(r); setStaffId(r.assignedStaffId || '') }}><UserPlus size={14} /> {r.assignedStaffId ? 'Reassign' : 'Assign'}</Button>}
          {(isStaff || isManager) && r.status === 'OPEN' &&
            <Button size="sm" loading={busy === r.id} onClick={() => changeStatus(r, 'IN_PROGRESS', 'Work started')}><Play size={14} /> Start</Button>}
          {(isStaff || isManager) && r.status === 'IN_PROGRESS' &&
            <Button size="sm" loading={busy === r.id} onClick={() => changeStatus(r, 'RESOLVED', 'Marked as resolved. The customer is notified.')}><CheckCircle2 size={14} /> Resolve</Button>}
          {isManager && r.status === 'RESOLVED' &&
            <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => changeStatus(r, 'CLOSED', 'Request closed')}><Lock size={14} /> Close</Button>}
        </div>
      )
    } },
  ]

  return (
    <>
      <PageHeader title="Support requests"
        subtitle={isStaff || isManager ? 'Requests from customers at your facility. Reply directly (no assignment needed), start and resolve them.' : 'All support requests (read only).'} />
      <div className="toolbar">
        <Select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select label="Priority" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">All priorities</option>
          {SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </Select>
        {isStaff && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} /> Assigned to me
          </label>)}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id" empty={<EmptyState title="No support requests" message="Try different filters." />} />}

      <FormModal open={!!assigning} title="Assign staff" onClose={() => setAssigning(null)} onSubmit={assign} submitText="Assign">
        <div className="span-2">
          <Select label="Staff member" required value={staffId} onChange={(e) => setStaffId(e.target.value)}
            hint={!staffList.loading && !staffOptions.length ? 'No staff are assigned to this facility yet.' : undefined}>
            <option value="">Select staff</option>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.fullname}</option>)}
          </Select>
        </div>
      </FormModal>

      <Modal wide open={!!viewing} title={viewing?.title || ''} onClose={() => setViewing(null)}>
        {viewing && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge status={viewing.status} /><Badge status={viewing.priority} /><span className="muted small">{label(viewing.supportType)}</span></div>
            <p>{viewing.description || <span className="muted">No description.</span>}</p>
            <div className="muted small">Customer: {viewing.customerName} · Unit {viewing.unitCode} · {viewing.facilityName}</div>
            <div className="muted small">Sent {fmtDateTime(viewing.createdAt)}{viewing.resolvedAt ? ` · Resolved ${fmtDateTime(viewing.resolvedAt)}` : ''}</div>
            <div className="muted small">{viewing.assignedStaffName ? `Handled by ${viewing.assignedStaffName}` : 'Nobody in charge yet: the first staff member to reply takes it.'}</div>
            <SupportThread replies={viewing.replies} canReply={(isStaff || isManager) && viewing.status !== 'CLOSED'} onSend={sendReply}
              placeholder="The customer is notified and sees your reply under My support requests." />
          </div>
        )}
      </Modal>
    </>
  )
}

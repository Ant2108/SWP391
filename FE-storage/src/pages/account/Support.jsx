import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Phone, UserRound } from 'lucide-react'
import { PageHeader, Card, Button, Badge, Input, Select, Textarea, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import SupportThread from '../../components/SupportThread.jsx'
import { api, SUPPORT_TYPES, SUPPORT_PRIORITIES } from '../../api/client.js'
import { fmtDateTime, label } from '../../utils/format.js'

const BLANK = { rentalContractId: '', supportType: 'UNIT', title: '', description: '', priority: 'MEDIUM' }

export default function Support() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const requests = useAsync(() => api.supportRequests.my())
  const options = useAsync(() => api.appointments.bookingOptions())
  const questions = useAsync(() => api.inquiries.my())
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [viewId, setViewId] = useState(null)
  const [closing, setClosing] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const view = requests.data?.find((r) => r.id === viewId)
  const contracts = options.data?.contracts || []

  // /account/support?new=1&subject=... (từ nút "Contact staff") mở sẵn form tạo yêu cầu.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setForm({ ...BLANK, title: params.get('subject') || '' })
    setCreating(true)
    setParams({}, { replace: true })
  }, [params, setParams])

  const create = async () => {
    if (!form.rentalContractId) throw new Error('Vui lòng chọn ô kho đang thuê mà yêu cầu này liên quan đến')
    const r = await api.supportRequests.create({
      rentalContractId: Number(form.rentalContractId), supportType: form.supportType,
      title: form.title, description: orNull(form.description), priority: form.priority,
    })
    toast('Đã gửi yêu cầu cho nhân viên')
    setCreating(false); setForm(BLANK)
    requests.reload(); setViewId(r.id)
  }

  const sendReply = async (message) => {
    await api.supportRequests.reply(view.id, message)
    toast('Đã gửi phản hồi'); requests.reload()
  }

  const closeRequest = async () => {
    setClosing(true)
    try { await api.supportRequests.setStatus(view.id, 'CLOSED'); toast('Đã đóng yêu cầu'); requests.reload() }
    catch (e) { toast(e.message, 'error') } finally { setClosing(false) }
  }

  return (
    <>
      <PageHeader title="Hỗ trợ" subtitle="Nhờ nhân viên hỗ trợ về ô kho quý khách đang thuê."
        actions={<Button onClick={() => { setForm(BLANK); setCreating(true) }}><Plus size={18} /> Tạo yêu cầu mới</Button>} />
      <Card className="loc-card" style={{ marginBottom: 24 }}>
        <div className="meta"><Phone size={18} /><span>Cần hỗ trợ gấp? Hãy gọi trực tiếp cho cơ sở. Số điện thoại có ở trang <Link to="/contact" style={{ textDecoration: 'underline' }}>Liên hệ</Link>.</span></div>
      </Card>

      {requests.loading ? <LoadingState /> : requests.error ? <ErrorState error={requests.error} onRetry={requests.reload} /> :
        !requests.data.length ? <EmptyState title="Chưa có yêu cầu hỗ trợ" message="Gửi yêu cầu, nhân viên sẽ phản hồi cho quý khách." /> : (
          <div className="grid grid-3">
            {requests.data.map((r) => (
              <Card hover key={r.id} className="loc-card" onClick={() => setViewId(r.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3>{r.title}</h3><Badge status={r.status} /></div>
                <div className="muted small">{label(r.supportType)} · Ô {r.unitCode} · {r.facilityName}</div>
                <div className="meta"><UserRound size={18} /><span>{r.assignedStaffName ? `Nhân viên phụ trách: ${r.assignedStaffName}` : 'Đang chờ phân công nhân viên'} · {fmtDateTime(r.createdAt)}</span></div>
              </Card>
            ))}
          </div>
        )}

      <h2 style={{ margin: '32px 0 12px' }}>Câu hỏi của tôi</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Các câu hỏi quý khách gửi từ trang <Link to="/support" style={{ textDecoration: 'underline' }}>Đặt câu hỏi cho nhân viên</Link> bằng email tài khoản, kèm câu trả lời của chúng tôi.
      </p>
      {questions.loading ? <LoadingState /> : questions.error ? <ErrorState error={questions.error} onRetry={questions.reload} /> :
        !questions.data.length ? <p className="muted">Quý khách chưa gửi câu hỏi nào.</p> : (
          <div className="grid grid-3">
            {questions.data.map((q) => (
              <Card key={q.id} className="loc-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <h3>{q.subject}</h3>
                  <Badge tone={q.status === 'OPEN' ? 'yellow' : 'green'}>{q.status === 'OPEN' ? 'Chờ trả lời' : 'Đã trả lời'}</Badge>
                </div>
                <div className="muted small">{q.facilityName} · {fmtDateTime(q.createdAt)}</div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{q.message}</p>
                {q.answer && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--surface-2, #f3f0e8)' }}>
                    <div className="muted small">{q.answeredByName} · {fmtDateTime(q.answeredAt)}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</div>
                  </div>)}
              </Card>
            ))}
          </div>)}

      <FormModal open={creating} title="Yêu cầu hỗ trợ mới" onClose={() => setCreating(false)} onSubmit={create} submitText="Gửi">
        <div className="span-2">
          <Select label="Ô kho đang thuê" required value={form.rentalContractId} onChange={set('rentalContractId')}
            hint={!options.loading && !contracts.length ? 'Quý khách cần có hợp đồng đang thuê để gửi yêu cầu.' : undefined}>
            <option value="">Chọn…</option>
            {contracts.map((c) => <option key={c.rentalContractId} value={c.rentalContractId}>Ô {c.unitCode} tại {c.facilityName}</option>)}
          </Select>
        </div>
        <Select label="Loại yêu cầu" value={form.supportType} onChange={set('supportType')}>{SUPPORT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Select label="Mức ưu tiên" value={form.priority} onChange={set('priority')}>{SUPPORT_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        <div className="span-2"><Input label="Tiêu đề" required maxLength={200} value={form.title} onChange={set('title')} /></div>
        <div className="span-2"><Textarea label="Mô tả chi tiết" maxLength={1000} value={form.description} onChange={set('description')} /></div>
      </FormModal>

      <Modal wide open={!!view} title={view?.title || ''} onClose={() => setViewId(null)}>
        {view && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge status={view.status} /><Badge status={view.priority} /><span className="muted small">{label(view.supportType)}</span></div>
            <p>{view.description || <span className="muted">Không có mô tả.</span>}</p>
            <div className="muted small">Ô {view.unitCode} · {view.facilityName}</div>
            <div className="muted small">Gửi lúc {fmtDateTime(view.createdAt)}{view.resolvedAt ? ` · Giải quyết lúc ${fmtDateTime(view.resolvedAt)}` : ''}</div>
            <div className="muted small">{view.assignedStaffName ? `Nhân viên phụ trách: ${view.assignedStaffName}` : 'Quản lý sẽ sớm phân công nhân viên.'}</div>
            <SupportThread replies={view.replies} canReply={view.status !== 'CLOSED'} onSend={sendReply}
              placeholder="Nhân viên đã được thông báo và sẽ trả lời tại đây." />
            {view.status === 'RESOLVED' && (
              <div><Button size="sm" onClick={closeRequest} loading={closing}>Xác nhận đã giải quyết và đóng yêu cầu</Button></div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

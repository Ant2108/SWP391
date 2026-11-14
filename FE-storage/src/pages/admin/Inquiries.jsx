import { useState } from 'react'
import { MessageSquareReply } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Select, Textarea, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api } from '../../api/client.js'
import { fmtDateTime } from '../../utils/format.js'

// Câu hỏi khách gửi từ trang Support (có hoặc không có tài khoản). Nhân viên / quản lý của cơ sở trả lời,
// câu trả lời được gửi về email của khách. Admin chỉ xem.
export default function Inquiries() {
  const { user } = useAuth()
  const toast = useToast()
  const canAnswer = user?.role === 'FACILITY_STAFF' || user?.role === 'FACILITY_MANAGER'
  const [status, setStatus] = useState('OPEN')
  const list = useAsync(() => api.inquiries.list({ status: status || undefined }), [status])
  const [answering, setAnswering] = useState(null)
  const [answer, setAnswer] = useState('')

  const submit = async () => {
    if (!answer.trim()) throw new Error('Vui lòng nhập câu trả lời')
    await api.inquiries.answer(answering.id, answer.trim())
    toast('Đã gửi câu trả lời cho khách qua email')
    setAnswering(null); setAnswer(''); list.reload()
  }

  const columns = [
    { key: 'when', header: 'Đã nhận', render: (q) => <><div className="cell-title">{fmtDateTime(q.createdAt)}</div><div className="cell-sub">#{q.id} · {q.facilityName}</div></> },
    { key: 'who', header: 'Từ', render: (q) => <><div className="cell-title">{q.name}</div><div className="cell-sub">{q.email}{q.phone ? ` · ${q.phone}` : ''}</div></> },
    { key: 'what', header: 'Câu hỏi', render: (q) => (
      <div style={{ maxWidth: 420 }}>
        <div className="cell-title">{q.subject}</div>
        <div className="cell-sub" style={{ whiteSpace: 'pre-wrap' }}>{q.message}</div>
        {q.answer && <div className="cell-sub" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}><strong>Answer ({q.answeredByName}, {fmtDateTime(q.answeredAt)}):</strong> {q.answer}</div>}
      </div>) },
    { key: 'status', header: 'Trạng thái', render: (q) => <Badge tone={q.status === 'OPEN' ? 'yellow' : 'green'}>{q.status === 'OPEN' ? 'Chờ trả lời' : 'Đã trả lời'}</Badge> },
    { key: 'actions', header: '', className: 'actions', render: (q) => canAnswer && q.status === 'OPEN' &&
      <Button size="sm" onClick={() => { setAnswering(q); setAnswer('') }}><MessageSquareReply size={14} /> Trả lời</Button> },
  ]

  return (
    <>
      <PageHeader title="Câu hỏi của khách" subtitle={canAnswer ? 'Câu hỏi gửi từ trang Hỗ trợ (có hoặc không có tài khoản). Câu trả lời của bạn được gửi cho khách qua email.' : 'Câu hỏi gửi từ trang Hỗ trợ (chỉ xem).'} />
      <div className="toolbar">
        <Select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Chờ trả lời</option>
          <option value="ANSWERED">Đã trả lời</option>
          <option value="">All</option>
        </Select>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id"
          empty={<EmptyState title={status === 'OPEN' ? 'Không có câu hỏi nào đang chờ' : 'Chưa có câu hỏi'} message="Câu hỏi mới từ trang Hỗ trợ sẽ hiện ở đây và trong chuông thông báo." />} />}

      <FormModal open={!!answering} title="Trả lời câu hỏi" onClose={() => setAnswering(null)} onSubmit={submit} submitText="Gửi câu trả lời">
        {answering && <>
          <div className="span-2">
            <p style={{ margin: 0 }}><strong>{answering.name}</strong> ({answering.email}) asked:</p>
            <p className="muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}><strong>{answering.subject}</strong>{'\n'}{answering.message}</p>
          </div>
          <div className="span-2"><Textarea label="Câu trả lời của bạn" required maxLength={1000} rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} hint="Sẽ gửi cho khách qua email." /></div>
        </>}
      </FormModal>
    </>
  )
}

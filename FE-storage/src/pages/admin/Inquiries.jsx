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
    if (!answer.trim()) throw new Error('Please write an answer')
    await api.inquiries.answer(answering.id, answer.trim())
    toast('Answer sent to the customer by email')
    setAnswering(null); setAnswer(''); list.reload()
  }

  const columns = [
    { key: 'when', header: 'Received', render: (q) => <><div className="cell-title">{fmtDateTime(q.createdAt)}</div><div className="cell-sub">#{q.id} · {q.facilityName}</div></> },
    { key: 'who', header: 'From', render: (q) => <><div className="cell-title">{q.name}</div><div className="cell-sub">{q.email}{q.phone ? ` · ${q.phone}` : ''}</div></> },
    { key: 'what', header: 'Question', render: (q) => (
      <div style={{ maxWidth: 420 }}>
        <div className="cell-title">{q.subject}</div>
        <div className="cell-sub" style={{ whiteSpace: 'pre-wrap' }}>{q.message}</div>
        {q.answer && <div className="cell-sub" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}><strong>Answer ({q.answeredByName}, {fmtDateTime(q.answeredAt)}):</strong> {q.answer}</div>}
      </div>) },
    { key: 'status', header: 'Status', render: (q) => <Badge tone={q.status === 'OPEN' ? 'yellow' : 'green'}>{q.status === 'OPEN' ? 'Waiting for answer' : 'Answered'}</Badge> },
    { key: 'actions', header: '', className: 'actions', render: (q) => canAnswer && q.status === 'OPEN' &&
      <Button size="sm" onClick={() => { setAnswering(q); setAnswer('') }}><MessageSquareReply size={14} /> Answer</Button> },
  ]

  return (
    <>
      <PageHeader title="Inquiries" subtitle={canAnswer ? 'Questions sent from the Support page, with or without an account. Your answer is emailed to the customer.' : 'Questions sent from the Support page (read only).'} />
      <div className="toolbar">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Waiting for answer</option>
          <option value="ANSWERED">Answered</option>
          <option value="">All</option>
        </Select>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        <DataTable columns={columns} rows={list.data} rowKey="id"
          empty={<EmptyState title={status === 'OPEN' ? 'No questions waiting' : 'No questions'} message="New questions from the Support page appear here and in your notification bell." />} />}

      <FormModal open={!!answering} title="Answer a question" onClose={() => setAnswering(null)} onSubmit={submit} submitText="Send answer">
        {answering && <>
          <div className="span-2">
            <p style={{ margin: 0 }}><strong>{answering.name}</strong> ({answering.email}) asked:</p>
            <p className="muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}><strong>{answering.subject}</strong>{'\n'}{answering.message}</p>
          </div>
          <div className="span-2"><Textarea label="Your answer" required maxLength={1000} rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} hint="Sent to the customer by email." /></div>
        </>}
      </FormModal>
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, LifeBuoy, Mail } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Textarea, LoadingState, ErrorState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { api } from '../api/client.js'

const BLANK = { facilityId: '', name: '', email: '', phone: '', subject: '', message: '', website: '' }

// Trang Support công khai: ai cũng gửi được câu hỏi (có hoặc không có tài khoản); nhân viên cơ sở trả lời qua email.
export default function AskSupport() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const [form, setForm] = useState(BLANK)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null) // email đã gửi câu hỏi
  const signedIn = !!user?.accessToken
  const isCustomer = signedIn && !isAdminRole(user.role)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Điền sẵn cơ sở (từ nút "Contact staff" ở trang Contact) và thông tin của người đang đăng nhập.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      facilityId: f.facilityId || params.get('facility') || '',
      name: f.name || user?.fullname || '',
      email: f.email || user?.email || '',
      subject: f.subject || params.get('subject') || '',
    }))
  }, [params, user?.fullname, user?.email])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.facilityId) { setError('Please choose the facility your question is about'); return }
    setSending(true)
    try {
      await api.inquiries.create({
        facilityId: Number(form.facilityId), name: form.name, email: form.email,
        phone: form.phone || null, subject: form.subject, message: form.message, website: form.website,
      })
      setSent(form.email)
    } catch (err) {
      setError(err.message || 'Could not send your question. Please try again.')
    } finally { setSending(false) }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <PageHeader eyebrow="Support" title="Ask our staff a question"
          subtitle="No account needed. Tell us what you would like to know and the team at the facility will answer by email." />

        {sent ? (
          <Card>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <CheckCircle2 size={32} color="#16803c" style={{ flexShrink: 0 }} />
              <div>
                <h3 style={{ margin: '0 0 6px' }}>Thank you, your question was sent</h3>
                <p className="muted" style={{ margin: 0 }}>We will reply to <strong>{sent}</strong> as soon as possible. Please also check your spam folder.</p>
                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={() => { setSent(null); setForm({ ...BLANK, name: form.name, email: form.email, facilityId: form.facilityId }) }}>Ask another question</Button>
                  <Button as={Link} to="/storage-options">Find a storage unit</Button>
                </div>
              </div>
            </div>
          </Card>
        ) : facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> : (
          <form onSubmit={submit} noValidate={false}>
            <Card>
              <div className="form-grid">
                <div className="span-2">
                  <Select label="Which facility is your question about?" required value={form.facilityId} onChange={set('facilityId')}>
                    <option value="">Select a facility</option>
                    {(facilities.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </div>
                <Input label="Your name" required maxLength={150} autoComplete="name" value={form.name} onChange={set('name')} />
                <Input label="Email" type="email" required maxLength={150} autoComplete="email" value={form.email} onChange={set('email')} readOnly={isCustomer}
                  hint={isCustomer ? 'Your account email. The answer is also shown under My support requests.' : 'We send the answer to this address.'} />
                <Input label="Phone (optional)" maxLength={20} autoComplete="tel" value={form.phone} onChange={set('phone')} />
                <Input label="Subject" required maxLength={200} value={form.subject} onChange={set('subject')} placeholder="e.g. Opening hours, unit sizes, prices" />
                <div className="span-2">
                  <Textarea label="Your question" required maxLength={1000} rows={5} value={form.message} onChange={set('message')} />
                </div>
                {/* Ô chống bot: người thật không thấy và không điền. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                  <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                </div>
              </div>
              {error && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error}</div>}
              <Button type="submit" size="lg" loading={sending} style={{ marginTop: 20 }}><Mail size={18} /> Send question</Button>
            </Card>
          </form>
        )}

        {isCustomer && (
          <Card style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <LifeBuoy size={24} />
                <div>
                  <strong>Already renting a unit?</strong>
                  <div className="muted small">Report a problem with your unit, lock or key and follow its progress.</div>
                </div>
              </div>
              <Button as={Link} to="/account/support" variant="secondary">My support requests</Button>
            </div>
          </Card>
        )}
      </div>
    </section>
  )
}

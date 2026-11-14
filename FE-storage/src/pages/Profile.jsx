import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { Badge, Button, Card, Input, PageHeader } from '../components/ui.jsx'
import { Avatar, displayName } from '../components/UserMenu.jsx'
import { MailCheck } from 'lucide-react'

// Lỗi validation của BE có dạng { message, error, <field>: "..." } → tách lỗi theo field.
const fieldErrors = (err, fields) =>
  Object.fromEntries(fields.filter((f) => typeof err?.data?.[f] === 'string').map((f) => [f, err.data[f]]))

function ProfileForm() {
  const { user, updateProfile, refreshProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ fullname: user?.fullname || '', email: user?.email || '', phone: user?.phone || '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')

  useEffect(() => {
    refreshProfile()
      .then((u) => u && setForm({ fullname: u.fullname || '', email: u.email || '', phone: u.phone || '' }))
      .catch((err) => toast(err.message, 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }) }

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setErrors({}); setLoading(true)
    try {
      const res = await updateProfile({ ...form, fullname: form.fullname.trim(), email: form.email.trim(), phone: form.phone.trim() })
      if (res.pendingEmail) {
        setPendingEmail(res.pendingEmail)
        setForm((f) => ({ ...f, email: res.email }))
        toast(`Vui lòng kiểm tra ${res.email} để xác nhận đổi email`)
      } else {
        toast('Đã cập nhật hồ sơ')
      }
    } catch (err) {
      setErrors(fieldErrors(err, ['fullname', 'email', 'phone']))
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: 20, margin: '0 0 20px' }}>Thông tin cá nhân</h2>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <Input label="Họ và tên" required minLength={2} maxLength={100} value={form.fullname} onChange={set('fullname')} error={errors.fullname} />
        <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email}
          hint="Đổi email cần xác nhận qua liên kết gửi đến địa chỉ hiện tại" />
        {pendingEmail && (
          <div className="form-notice" role="status">
            <MailCheck size={18} />
            <span>Chúng tôi đã gửi liên kết xác nhận đến email hiện tại <strong>{form.email}</strong>. Email sẽ đổi thành <strong>{pendingEmail}</strong> sau khi quý khách mở liên kết (có hiệu lực 30 phút).</span>
          </div>
        )}
        <Input label="Số điện thoại" required pattern="0[0-9]{9}" hint="10 chữ số, bắt đầu bằng 0" value={form.phone} onChange={set('phone')} error={errors.phone} />
        {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
        <div><Button type="submit" loading={loading}>Lưu thay đổi</Button></div>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const toast = useToast()
  const empty = { oldPassword: '', newPassword: '', confirm: '' }
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.newPassword !== form.confirm) { setError('Mật khẩu mới nhập lại không khớp'); return }
    setLoading(true)
    try {
      await api.auth.changePassword(form.oldPassword, form.newPassword)
      toast('Đã đổi mật khẩu')
      setForm(empty)
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card id="password">
      <h2 style={{ fontSize: 20, margin: '0 0 20px' }}>Đổi mật khẩu</h2>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <Input label="Mật khẩu hiện tại" type="password" required autoComplete="current-password" value={form.oldPassword} onChange={set('oldPassword')} />
        <Input label="Mật khẩu mới" type="password" required minLength={6} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} />
        <Input label="Nhập lại mật khẩu mới" type="password" required minLength={6} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
        <div><Button type="submit" loading={loading}>Cập nhật mật khẩu</Button></div>
      </form>
    </Card>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 1040 }}>
        <PageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân" />
        <div className="profile-head">
          <Avatar user={user} size={72} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{displayName(user)}</div>
            <div className="muted">{user?.email}</div>
            {user?.role && <div style={{ marginTop: 6 }}><Badge tone="yellow" status={user.role} /></div>}
          </div>
        </div>
        <div className="profile-grid">
          <ProfileForm />
          <PasswordForm />
        </div>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useToast } from '../hooks/useToast.jsx'
import { Input, Button } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

export default function ForgotPassword() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.auth.forgotPassword(email.trim())
      setSent(true)
      toast('Đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.')
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Quên mật khẩu" subtitle="Nhập email, chúng tôi sẽ gửi liên kết đặt lại mật khẩu cho bạn." footer={<Link to="/login">Quay lại đăng nhập</Link>}>
      {sent ? (
        <p>Nếu email này đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
          <Button type="submit" loading={loading}>Gửi liên kết đặt lại</Button>
        </form>
      )}
    </AuthShell>
  )
}

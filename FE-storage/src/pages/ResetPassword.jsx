import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useToast } from '../hooks/useToast.jsx'
import { Input, Button } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.auth.resetPassword(token, password)
      toast('Đã đặt lại mật khẩu. Vui lòng đăng nhập.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đặt lại mật khẩu" subtitle="Chọn mật khẩu mới cho tài khoản của bạn." footer={<Link to="/login">Quay lại đăng nhập</Link>}>
      {!token ? (
        <p>Liên kết đặt lại mật khẩu này thiếu mã xác thực. Hãy yêu cầu liên kết mới ở trang <Link to="/forgot-password">quên mật khẩu</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <Input label="Mật khẩu mới" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
          <Button type="submit" loading={loading}>Đặt lại mật khẩu</Button>
        </form>
      )}
    </AuthShell>
  )
}

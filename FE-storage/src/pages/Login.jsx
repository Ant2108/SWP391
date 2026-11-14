import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { Input, Button } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'
import GoogleButton from '../components/GoogleButton.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const googleError = new URLSearchParams(location.search).get('error') // BE chuyển về /login?error=... khi Google thất bại
  const target = (role) => location.state?.from || (isAdminRole(role) ? '/admin' : '/')

  if (user?.accessToken && !loading) return <Navigate to={target(user.role)} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const u = await login(email.trim(), password)
      toast(`Chào mừng quay lại${u?.fullname ? `, ${u.fullname}` : ''}!`)
      setLoading(false)
      navigate(target(u?.role), { replace: true })
    } catch (err) {
      const msg = err.message || 'Đăng nhập thất bại'
      setError(msg)
      toast(msg, 'error')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Chào mừng quay lại"
      subtitle="Đăng nhập để quản lý ô kho, thanh toán và hợp đồng của bạn."
      footer={<>Mới đến SafeSpace? <Link to="/register">Thuê ô kho đầu tiên</Link></>}
    >
      {googleError && <div className="form-alert" role="alert">{googleError}</div>}
      <form onSubmit={onSubmit} className="auth-fields">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" required />
        <div className="auth-password">
          <Input label="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <Link to="/forgot-password" className="auth-forgot">Quên mật khẩu?</Link>
        </div>
        {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
        <Button type="submit" loading={loading} className="auth-submit">Đăng nhập</Button>
      </form>
      <div className="auth-alt">
        <GoogleButton label="Đăng nhập bằng Google" dividerFirst />
      </div>
    </AuthShell>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../api/client.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Button, LoadingState } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

// Mở từ link trong email xác nhận đổi email: /confirm-email?token=...
export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { user, refreshProfile } = useAuth()
  const [state, setState] = useState(token ? { status: 'loading' } : { status: 'error', message: 'Liên kết xác nhận này thiếu mã xác thực.' })
  const sent = useRef(false)

  useEffect(() => {
    // Token chỉ dùng được 1 lần → tránh gọi 2 lần khi StrictMode chạy effect lặp.
    if (!token || sent.current) return
    sent.current = true
    api.auth.confirmEmailChange(token)
      .then(async (profile) => {
        setState({ status: 'done', email: profile.email })
        // JWT cũ gắn với email cũ → client tự refresh token rồi tải lại profile.
        if (user) await refreshProfile().catch(() => {})
      })
      .catch((err) => setState({ status: 'error', message: err.message }))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthShell title="Xác nhận đổi email" footer={<Link to="/">Về trang chủ</Link>}>
      {state.status === 'loading' && <LoadingState label="Đang xác nhận email…" />}
      {state.status === 'done' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="form-notice" role="status">
            <CheckCircle2 size={18} />
            <span>Email của quý khách giờ là <strong>{state.email}</strong>. Hãy dùng email này khi đăng nhập lần sau.</span>
          </div>
          {user
            ? <Button as={Link} to="/profile">Đến hồ sơ cá nhân</Button>
            : <Button as={Link} to="/login">Đăng nhập</Button>}
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="form-alert" role="alert" style={{ margin: 0, display: 'flex', gap: 10 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{state.message}</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>Quý khách có thể yêu cầu liên kết mới bằng cách đổi email lại trong hồ sơ cá nhân.</p>
          <Button as={Link} to={user ? '/profile' : '/login'} variant="secondary">{user ? 'Đến hồ sơ cá nhân' : 'Đăng nhập'}</Button>
        </div>
      )}
    </AuthShell>
  )
}

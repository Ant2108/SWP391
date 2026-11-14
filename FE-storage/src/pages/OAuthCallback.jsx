import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { LoadingState } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

// Trang nhận kết quả đăng nhập Google: Backend chuyển về đây kèm token sau dấu #.
export default function OAuthCallback() {
  const { loginWithTokens } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // tránh chạy hai lần ở chế độ dev
    started.current = true
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = params.get('accessToken')
    if (!accessToken) { setError('Đăng nhập Google không trả về phiên làm việc. Vui lòng thử lại.'); return }
    // Xóa token khỏi thanh địa chỉ ngay.
    window.history.replaceState(null, '', window.location.pathname)
    loginWithTokens({
      accessToken,
      refreshToken: params.get('refreshToken'),
      tokenType: 'Bearer',
      userId: Number(params.get('userId')) || null,
      email: params.get('email'),
      role: params.get('role'),
    }).then((u) => {
      toast(`Welcome${u?.fullname ? `, ${u.fullname}` : ''}!`)
      navigate(isAdminRole(u?.role) ? '/admin' : '/', { replace: true })
    }).catch(() => setError('Không hoàn tất được đăng nhập. Vui lòng thử lại.'))
  }, [loginWithTokens, navigate, toast])

  return (
    <AuthShell title="Đang đăng nhập" footer={error ? <Link to="/login">Quay lại đăng nhập</Link> : null}>
      {error ? <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div> : <LoadingState />}
    </AuthShell>
  )
}

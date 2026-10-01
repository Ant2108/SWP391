import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'

// Mặc định chỉ cho staff/admin; `any` = chỉ cần đăng nhập (vd. trang hồ sơ của khách).
export default function RequireAuth({ children, any = false }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user?.accessToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!any && !isAdminRole(user.role)) return <Navigate to="/" replace />
  return children
}

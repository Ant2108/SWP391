import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { Button, EmptyState } from './ui.jsx'

// Mặc định chỉ cho staff/admin; `any` = chỉ cần đăng nhập (vd. trang hồ sơ của khách).
// `customer` = trang dành riêng cho khách (đặt kho, hợp đồng, hỗ trợ...): nhân viên/quản lý/admin
// làm việc ở trang quản lý nên được hướng dẫn quay lại đó thay vì gặp lỗi 403.
export default function RequireAuth({ children, any = false, customer = false }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user?.accessToken) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!any && !isAdminRole(user.role)) return <Navigate to="/" replace />
  if (customer && isAdminRole(user.role)) {
    return (
      <section className="section">
        <div className="container">
          <EmptyState
            title="This page is for customers"
            message="You are signed in with a staff account. Please use the management console for your work."
            action={<Button as={Link} to="/admin">Go to management console</Button>}
          />
        </div>
      </section>
    )
  }
  return children
}

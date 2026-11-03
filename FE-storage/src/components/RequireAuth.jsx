import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { Button, EmptyState } from './ui.jsx'

// Mặc định chỉ cho staff/admin; `any` = chỉ cần đăng nhập (vd. trang hồ sơ của khách).
// `customer` = trang dành riêng cho khách (đặt kho, hợp đồng, hỗ trợ...): nhân viên/quản lý/admin
// làm việc ở trang quản lý nên được hướng dẫn quay lại đó thay vì gặp lỗi 403.
// `roles` = danh sách vai trò được vào trang quản lý này (khớp menu và @PreAuthorize ở BE); vai trò khác thấy thông báo
// "không có quyền" thay vì một trang đầy lỗi 403.
export default function RequireAuth({ children, any = false, customer = false, roles }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user?.accessToken) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!any && !isAdminRole(user.role)) return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState
        title="You do not have access to this page"
        message="Your role cannot use this part of the management console. Use the menu on the left for the pages that are available to you."
        action={<Button as={Link} to="/admin">Back to dashboard</Button>}
      />
    )
  }
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

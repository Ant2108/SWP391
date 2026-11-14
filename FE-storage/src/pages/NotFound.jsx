import { Link } from 'react-router-dom'
import { Button } from '../components/ui.jsx'

export default function NotFound({ admin }) {
  return (
    <div className="error-page">
      <div>
        <div className="error-code">404</div>
        <h2 style={{ marginTop: 8 }}>Không tìm thấy trang</h2>
        <p className="lead" style={{ margin: '12px auto 32px' }}>Trang bạn tìm không tồn tại hoặc đã được chuyển đi.</p>
        <Button as={Link} to={admin ? '/admin' : '/'} size="lg">{admin ? 'Về trang tổng quan' : 'Về trang chủ'}</Button>
      </div>
    </div>
  )
}

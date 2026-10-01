import { Link } from 'react-router-dom'
import { Button } from '../components/ui.jsx'

export default function NotFound({ admin }) {
  return (
    <div className="error-page">
      <div>
        <div className="error-code">404</div>
        <h2 style={{ marginTop: 8 }}>Page not found</h2>
        <p className="lead" style={{ margin: '12px auto 32px' }}>The page you are looking for does not exist or has been moved.</p>
        <Button as={Link} to={admin ? '/admin' : '/'} size="lg">{admin ? 'Back to dashboard' : 'Back to home'}</Button>
      </div>
    </div>
  )
}

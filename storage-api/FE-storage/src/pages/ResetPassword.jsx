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
      toast('Password reset. Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Reset password" footer={<Link to="/login">Back to sign in</Link>}>
      {!token ? (
        <p>This reset link is missing its token. Request a new one from the <Link to="/forgot-password">forgot password</Link> page.</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <Input label="New password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
          <Button type="submit" loading={loading}>Reset password</Button>
        </form>
      )}
    </AuthShell>
  )
}

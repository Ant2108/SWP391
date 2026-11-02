import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { Input, Button } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const target = (role) => location.state?.from || (isAdminRole(role) ? '/admin' : '/')

  if (user?.accessToken && !loading) return <Navigate to={target(user.role)} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const u = await login(email.trim(), password)
      toast(`Welcome back${u?.fullname ? `, ${u.fullname}` : ''}!`)
      setLoading(false)
      navigate(target(u?.role), { replace: true })
    } catch (err) {
      const msg = err.message || 'Login failed'
      setError(msg)
      toast(msg, 'error')
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Sign in" footer={<><Link to="/forgot-password">Forgot password?</Link><Link to="/register">Create account</Link></>}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
        <Button type="submit" loading={loading}>Sign in</Button>
      </form>
    </AuthShell>
  )
}

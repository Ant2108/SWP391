import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useToast } from '../hooks/useToast.jsx'
import { Input, Button } from '../components/ui.jsx'
import AuthShell from '../components/AuthShell.jsx'

export default function Register() {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ fullname: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.auth.register({ ...form, email: form.email.trim() })
      toast('Account created. Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create account" footer={<Link to="/login">Already have an account? Sign in</Link>}>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <Input label="Full name" required minLength={2} maxLength={100} value={form.fullname} onChange={set('fullname')} />
        <Input label="Email" type="email" required autoComplete="username" value={form.email} onChange={set('email')} />
        <Input label="Phone" required hint="10 digits starting with 0" pattern="0[0-9]{9}" value={form.phone} onChange={set('phone')} />
        <Input label="Password" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
        {error && <div className="form-alert" role="alert" style={{ margin: 0 }}>{error}</div>}
        <Button type="submit" loading={loading}>Create account</Button>
      </form>
    </AuthShell>
  )
}

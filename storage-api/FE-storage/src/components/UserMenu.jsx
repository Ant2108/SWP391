import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, UserRound, KeyRound, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { useToast } from '../hooks/useToast.jsx'

export const displayName = (u) => u?.fullname || u?.email?.split('@')[0] || 'Account'

export function Avatar({ user, size = 36 }) {
  const initials = displayName(user).split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initials}</span>
}

export function useSignOut() {
  const { logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  return async () => {
    await logout()
    toast('Signed out successfully')
    navigate('/')
  }
}

export default function UserMenu() {
  const { user } = useAuth()
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar user={user} />
        <span className="user-name">{displayName(user)}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-head">
            <strong>{displayName(user)}</strong>
            <span className="field-hint">{user?.email}</span>
          </div>
          <Link to="/profile" className="user-item" role="menuitem"><UserRound size={18} /> My profile</Link>
          <Link to="/profile#password" className="user-item" role="menuitem"><KeyRound size={18} /> Change password</Link>
          {isAdminRole(user?.role) && (
            <Link to="/admin" className="user-item" role="menuitem"><LayoutDashboard size={18} /> Management console</Link>
          )}
          <button className="user-item user-item-danger" role="menuitem" onClick={signOut}><LogOut size={18} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Building2, Boxes, Package, Tag, Menu, ArrowLeft, LogOut, Users, UserCog, KeyRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Brand } from './PublicLayout.jsx'
import { Input } from '../components/ui.jsx'
import FormModal from '../components/FormModal.jsx'
import { Avatar, displayName, useSignOut } from '../components/UserMenu.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/facilities', label: 'Facilities', icon: Building2 },
  { to: '/admin/unit-types', label: 'Unit Types', icon: Boxes },
  { to: '/admin/storage-units', label: 'Storage Units', icon: Package },
  { to: '/admin/price-rules', label: 'Price Rules', icon: Tag },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['SYSTEM_ADMIN'] },
  { to: '/admin/facility-assignments', label: 'Assignments', icon: UserCog, roles: ['SYSTEM_ADMIN'] },
]

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const signOut = useSignOut()
  const toast = useToast()
  const [pw, setPw] = useState(null) // null | { oldPassword, newPassword }
  const changePassword = async () => {
    await api.auth.changePassword(pw.oldPassword, pw.newPassword)
    toast('Password changed')
    setPw(null)
  }
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <div className="admin">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand to="/admin" />
        <nav className="side-nav" aria-label="Admin">
          {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <Icon size={19} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <Link to="/profile" className="side-user" title="My profile">
            <Avatar user={user} size={36} />
            <span style={{ minWidth: 0 }}>
              <strong>{displayName(user)}</strong>
              <span className="field-hint">{user?.role?.replace(/_/g, ' ')}</span>
            </span>
          </Link>
          <Link to="/" className="side-link"><ArrowLeft size={19} /> Back to website</Link>
          <button className="side-link" style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer', font: 'inherit' }} onClick={() => setPw({ oldPassword: '', newPassword: '' })}>
            <KeyRound size={19} /> Change password
          </button>
          <button className="side-link" style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer', font: 'inherit' }} onClick={signOut}>
            <LogOut size={19} /> Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-top">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <strong>SafeSpace Admin</strong>
        </div>
        <div className="admin-content"><Outlet /></div>
      </div>
      <FormModal open={!!pw} title="Change password" onClose={() => setPw(null)} onSubmit={changePassword}>
        <div className="span-2"><Input label="Current password" type="password" required autoComplete="current-password" value={pw?.oldPassword || ''} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} /></div>
        <div className="span-2"><Input label="New password" type="password" required minLength={6} autoComplete="new-password" value={pw?.newPassword || ''} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
      </FormModal>
    </div>
  )
}

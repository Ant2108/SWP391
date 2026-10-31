import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { UserRound, ClipboardList, Package, FileText, CreditCard, CalendarDays, LifeBuoy, Menu, ArrowLeft, LogOut, LayoutDashboard } from 'lucide-react'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { Brand } from './PublicLayout.jsx'

const NAV = [
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/account/reservations', label: 'My reservations', icon: ClipboardList },
  { to: '/account/units', label: 'My rented units', icon: Package },
  { to: '/account/contracts', label: 'Rental contracts', icon: FileText },
  { to: '/account/payments', label: 'Payments', icon: CreditCard },
  { to: '/account/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/account/support', label: 'Support', icon: LifeBuoy },
]

export default function AccountLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { setOpen(false) }, [pathname])

  const signOut = async () => { await logout(); navigate('/', { replace: true }) }
  const btn = { background: 'none', border: 0, width: '100%', cursor: 'pointer', font: 'inherit' }

  return (
    <div className="admin">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand to="/" />
        <nav className="side-nav" aria-label="Account">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <Icon size={19} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="field-hint" style={{ padding: '0 12px 8px' }}>{user?.email}</div>
          {isAdminRole(user?.role) && <Link to="/admin" className="side-link"><LayoutDashboard size={19} /> Admin console</Link>}
          <Link to="/" className="side-link"><ArrowLeft size={19} /> Back to website</Link>
          <button className="side-link" style={btn} onClick={signOut}><LogOut size={19} /> Sign out</button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-top">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <strong>My account</strong>
        </div>
        <div className="admin-content"><Outlet /></div>
      </div>
    </div>
  )
}

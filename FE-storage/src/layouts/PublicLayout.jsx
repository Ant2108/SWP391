import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, LogIn, LogOut, UserRound, LayoutDashboard } from 'lucide-react'
import { Button } from '../components/ui.jsx'
import UserMenu, { Avatar, displayName, useSignOut } from '../components/UserMenu.jsx'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/locations', label: 'Locations' },
  { to: '/storage-options', label: 'Storage Options' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand">
      <span className="brand-mark">SS</span>
      <span className="brand-name">SafeSpace Storage</span>
    </Link>
  )
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const signOut = useSignOut()
  const loggedIn = !!user?.accessToken
  useEffect(() => { setOpen(false) }, [pathname])

  const links = LINKS.map((l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {l.label}
    </NavLink>
  ))

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Brand />
        <nav className="nav-links" aria-label="Main">{links}</nav>
        <div className="nav-cta">
          {loggedIn
            ? <UserMenu />
            : <Button as={Link} to="/login"><LogIn size={18} /> Sign in</Button>}
          <button className="icon-btn nav-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="mobile-menu" aria-label="Mobile">
          {links}
          {loggedIn ? (
            <div className="mobile-user">
              <div className="mobile-user-head">
                <Avatar user={user} size={40} />
                <div style={{ minWidth: 0 }}>
                  <strong>{displayName(user)}</strong>
                  <div className="field-hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                </div>
              </div>
              <Link to="/profile" className="nav-link"><UserRound size={18} /> My profile</Link>
              {isAdminRole(user.role) && <Link to="/admin" className="nav-link"><LayoutDashboard size={18} /> Management console</Link>}
              <Button variant="secondary" onClick={signOut}><LogOut size={18} /> Sign out</Button>
            </div>
          ) : (
            <Button as={Link} to="/login"><LogIn size={18} /> Sign in</Button>
          )}
        </nav>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="muted" style={{ marginTop: 16, maxWidth: 360 }}>
              Safe, accessible storage for personal and business needs, with 24/7 security monitoring.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: 16 }}>Explore</h3>
            <ul>
              {LINKS.map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: 16 }}>Staff</h3>
            <ul><li><Link to="/admin">Management console</Link></li></ul>
          </div>
        </div>
        <p className="muted small">© {new Date().getFullYear()} SafeSpace Storage. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default function PublicLayout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <Navbar />
      <main><Outlet /></main>
      <Footer />
    </>
  )
}

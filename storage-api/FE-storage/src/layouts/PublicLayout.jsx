import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, LogIn, LogOut, UserRound, LayoutDashboard, ClipboardList, Package, FileText, CreditCard, CalendarDays, ChevronDown, MapPin, Phone, Mail } from 'lucide-react'
import { Button } from '../components/ui.jsx'
import UserMenu, { Avatar, displayName, useSignOut } from '../components/UserMenu.jsx'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/locations', label: 'Locations' },
  { to: '/services', label: 'Services' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/account/support', label: 'Support' },
  { to: '/contact', label: 'Contact' },
]

const MY_STORAGE = [
  { to: '/account/reservations', label: 'My reservations', icon: ClipboardList },
  { to: '/account/units', label: 'My rented units', icon: Package },
  { to: '/account/contracts', label: 'Rental contracts', icon: FileText },
  { to: '/account/payments', label: 'Payments', icon: CreditCard },
  { to: '/account/appointments', label: 'Appointments', icon: CalendarDays },
]

// Menu "My Storage": bấm để xổ danh sách việc của khách (đặt kho, hợp đồng, thanh toán, lịch hẹn).
function MyStorageMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()
  const active = pathname.startsWith('/account') && !pathname.startsWith('/account/support')

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
    <div className="nav-dropdown" ref={ref}>
      <button className={`nav-link nav-dropdown-trigger ${active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        My Storage <ChevronDown size={16} />
      </button>
      {open && (
        <div className="nav-dropdown-menu" role="menu">
          {MY_STORAGE.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} role="menuitem" className={({ isActive }) => `user-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

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

  const renderLink = (l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {l.label}
    </NavLink>
  )
  // "My Storage" nằm giữa Pricing và Support, chỉ hiện khi đã đăng nhập.
  const pricingAt = LINKS.findIndex((l) => l.to === '/pricing') + 1
  const links = [
    ...LINKS.slice(0, pricingAt).map(renderLink),
    ...(loggedIn ? [<MyStorageMenu key="my-storage" />] : []),
    ...LINKS.slice(pricingAt).map(renderLink),
  ]
  const mobileLinks = [
    ...LINKS.slice(0, pricingAt).map(renderLink),
    ...(loggedIn ? [
      <div key="my-storage" className="mobile-group">
        <span className="mobile-group-title">My Storage</span>
        {MY_STORAGE.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} /> {label}</NavLink>
        ))}
      </div>,
    ] : []),
    ...LINKS.slice(pricingAt).map(renderLink),
  ]

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
          {mobileLinks}
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
  const { user } = useAuth()
  const signedIn = !!user?.accessToken
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="muted" style={{ marginTop: 16, maxWidth: 360 }}>
              Safe, accessible storage for personal and business needs, with 24/7 security monitoring. Units in every size.
            </p>
            <div style={{ marginTop: 20 }}><Button as={Link} to="/storage-options" size="sm">Find a storage unit</Button></div>
          </div>
          <div>
            <h3>Explore</h3>
            <ul>
              {LINKS.map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}
              <li><Link to="/storage-options">Storage Options</Link></li>
            </ul>
          </div>
          <div>
            <h3>My account</h3>
            <ul>
              {signedIn ? (
                <>
                  <li><Link to="/account/reservations">Reservations</Link></li>
                  <li><Link to="/account/units">My storage units</Link></li>
                  <li><Link to="/account/payments">Payments</Link></li>
                  <li><Link to="/account/appointments">Appointments</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/login">Sign in</Link></li>
                  <li><Link to="/register">Create account</Link></li>
                  <li><Link to="/forgot-password">Forgot password</Link></li>
                </>
              )}
              <li><Link to="/admin">Staff console</Link></li>
            </ul>
          </div>
          <div>
            <h3>Get in touch</h3>
            <ul className="footer-contact">
              <li><MapPin size={16} /><span>See each facility for its address</span></li>
              <li><Phone size={16} /><span>Phone numbers are listed on the <Link to="/contact" style={{ textDecoration: 'underline' }}>Contact</Link> page</span></li>
              <li><Mail size={16} /><Link to="/account/support?new=1" style={{ textDecoration: 'underline' }}>Send a message to our staff</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom muted small">
          <span>© {new Date().getFullYear()} SafeSpace Storage. All rights reserved.</span>
          <span><Link to="/about">About</Link><Link to="/pricing">Pricing</Link><Link to="/contact">Contact</Link></span>
        </div>
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

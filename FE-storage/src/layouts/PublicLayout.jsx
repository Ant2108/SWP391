import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, LogIn, LogOut, UserRound, LayoutDashboard, ClipboardList, FileText, CreditCard, CalendarDays, ChevronDown, MapPin, Phone, Mail, LifeBuoy, Sun, Moon, Warehouse, Facebook, Instagram, Linkedin, Youtube } from 'lucide-react'
import NotificationBell from '../components/NotificationBell.jsx'
import { Button } from '../components/ui.jsx'
import UserMenu, { Avatar, displayName, useSignOut } from '../components/UserMenu.jsx'
import { useAuth, isAdminRole } from '../hooks/useAuth.jsx'
import { useTheme } from '../hooks/useTheme.jsx'
import ProfileRejectedPopup from '../components/ProfileRejectedPopup.jsx'

const LINKS = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/about', label: 'Giới thiệu' },
  { to: '/locations', label: 'Cơ sở kho' },
  { to: '/services', label: 'Dịch vụ' },
  { to: '/pricing', label: 'Bảng giá' },
  { to: '/support', label: 'Hỗ trợ' },
  { to: '/contact', label: 'Liên hệ' },
]

const MY_STORAGE = [
  { to: '/account/reservations', label: 'Đơn đặt kho của tôi', icon: ClipboardList },
  { to: '/account/contracts', label: 'Hợp đồng thuê kho', icon: FileText },
  { to: '/account/payments', label: 'Thanh toán', icon: CreditCard },
  { to: '/account/appointments', label: 'Lịch hẹn', icon: CalendarDays },
  { to: '/account/support', label: 'Yêu cầu hỗ trợ của tôi', icon: LifeBuoy },
]

// Menu "Kho của tôi": bấm để xổ danh sách việc của khách (đặt kho, hợp đồng, thanh toán, lịch hẹn).
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
        Kho của tôi <ChevronDown size={16} />
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
    <Link to={to} className="brand" aria-label="SafeSpace Storage, trang chủ">
      <span className="brand-mark"><Warehouse size={20} strokeWidth={2.2} /></span>
      <span className="brand-name">SafeSpace <span>Storage</span></span>
    </Link>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} title={dark ? 'Giao diện sáng' : 'Giao diện tối'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const signOut = useSignOut()
  const loggedIn = !!user?.accessToken
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const renderLink = (l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {l.label}
    </NavLink>
  )
  // "Kho của tôi" nằm giữa Bảng giá và Hỗ trợ. Khách chưa đăng nhập vẫn thấy menu này,
  // bấm vào sẽ được đưa tới trang đăng nhập. Nhân viên/quản lý/admin làm việc ở trang quản lý,
  // nên không thấy Kho của tôi và Hỗ trợ (trang của khách) mà thấy nút "Trang quản lý".
  const isStaff = loggedIn && isAdminRole(user.role)
  const isCustomer = !isStaff
  const publicLinks = isStaff ? LINKS.filter((l) => l.to !== '/support') : LINKS
  const pricingAt = publicLinks.findIndex((l) => l.to === '/pricing') + 1
  const consoleLink = { to: '/admin', label: 'Trang quản lý' }
  const links = [
    ...publicLinks.slice(0, pricingAt).map(renderLink),
    ...(isCustomer ? [<MyStorageMenu key="my-storage" />] : []),
    ...(isStaff ? [renderLink(consoleLink)] : []),
    ...publicLinks.slice(pricingAt).map(renderLink),
  ]
  const mobileLinks = [
    ...publicLinks.slice(0, pricingAt).map(renderLink),
    ...(isStaff ? [renderLink(consoleLink)] : []),
    ...(isCustomer ? [
      <div key="my-storage" className="mobile-group">
        <span className="mobile-group-title">Kho của tôi</span>
        {MY_STORAGE.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} /> {label}</NavLink>
        ))}
      </div>,
    ] : []),
    ...publicLinks.slice(pricingAt).map(renderLink),
  ]

  return (
    <header className={`site-nav ${scrolled || open ? 'is-scrolled' : ''}`}>
      <div className="container navbar-inner">
        <Brand />
        <nav className="nav-links" aria-label="Menu chính">{links}</nav>
        <div className="nav-cta">
          <ThemeToggle />
          {loggedIn && <NotificationBell />}
          {loggedIn
            ? <UserMenu />
            : <Link to="/login" className="btn-pill"><LogIn size={17} /> Đăng nhập</Link>}
          <button className="icon-btn nav-toggle" onClick={() => setOpen((o) => !o)} aria-label="Bật tắt menu" aria-expanded={open}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="mobile-menu" aria-label="Menu điện thoại">
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
              <Link to="/profile" className="nav-link"><UserRound size={18} /> Hồ sơ cá nhân</Link>
              {isAdminRole(user.role) && <Link to="/admin" className="nav-link"><LayoutDashboard size={18} /> Trang quản lý</Link>}
              <Button variant="secondary" onClick={signOut}><LogOut size={18} /> Đăng xuất</Button>
            </div>
          ) : (
            <Link to="/login" className="btn-pill"><LogIn size={17} /> Đăng nhập</Link>
          )}
        </nav>
      )}
    </header>
  )
}

// Chưa có trang mạng xã hội chính thức: thay href bằng link thật khi có.
const SOCIALS = [
  { label: 'Facebook', icon: Facebook, href: '#' },
  { label: 'Instagram', icon: Instagram, href: '#' },
  { label: 'LinkedIn', icon: Linkedin, href: '#' },
  { label: 'YouTube', icon: Youtube, href: '#' },
]

function Footer() {
  const { user } = useAuth()
  const signedIn = !!user?.accessToken
  const staff = signedIn && isAdminRole(user.role)
  return (
    <footer className="lp-footer">
      <div className="container">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Brand />
            <p>Kho tự quản an toàn, thuê và quản lý hoàn toàn trực tuyến. Cơ sở được giám sát 24/7, đủ mọi kích cỡ kho.</p>
            <div className="socials">
              {SOCIALS.map(({ label, icon: Icon, href }) => (
                <a key={label} href={href} aria-label={label} title={label}><Icon size={18} /></a>
              ))}
            </div>
          </div>
          <div>
            <h3>Khám phá</h3>
            <ul>
              {LINKS.filter((l) => !(staff && l.to === '/support'))
                .map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}
              <li><Link to="/storage-options">Các loại kho</Link></li>
            </ul>
          </div>
          <div>
            <h3>Tài khoản</h3>
            <ul>
              {staff ? (
                <li><Link to="/profile">Hồ sơ cá nhân</Link></li>
              ) : signedIn ? (
                <>
                  <li><Link to="/account/reservations">Đơn đặt kho</Link></li>
                  <li><Link to="/account/payments">Thanh toán</Link></li>
                  <li><Link to="/account/appointments">Lịch hẹn</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/login">Đăng nhập</Link></li>
                  <li><Link to="/register">Tạo tài khoản</Link></li>
                  <li><Link to="/forgot-password">Quên mật khẩu</Link></li>
                </>
              )}
              <li><Link to="/admin">Trang nhân viên</Link></li>
            </ul>
          </div>
          <div>
            <h3>Liên hệ</h3>
            <ul className="lp-footer-contact">
              <li><MapPin size={16} /><span>Địa chỉ xem tại từng cơ sở kho</span></li>
              <li><Phone size={16} /><span>Số điện thoại có trên trang <Link to="/contact" style={{ textDecoration: 'underline' }}>Liên hệ</Link></span></li>
              {!staff && <li><Mail size={16} /><Link to="/support" style={{ textDecoration: 'underline' }}>Gửi tin nhắn cho nhân viên</Link></li>}
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} SafeSpace Storage. Bảo lưu mọi quyền.</span>
          <nav aria-label="Chân trang"><Link to="/about">Giới thiệu</Link><Link to="/pricing">Bảng giá</Link><Link to="/contact">Liên hệ</Link></nav>
        </div>
      </div>
    </footer>
  )
}

export default function PublicLayout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const isHome = pathname === '/'
  return (
    <>
      <Navbar />
      {/* Trang trong có dải ảnh nền mờ phía trên; trang chủ dùng ảnh nền riêng của hero. */}
      {!isHome && <div className="page-backdrop" aria-hidden="true" />}
      <main className={`site-main ${isHome ? 'is-home' : ''}`}><Outlet /></main>
      <Footer />
      <ProfileRejectedPopup />
    </>
  )
}

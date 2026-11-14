import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Building2, Boxes, Package, Tag, Menu, Home, Users, UserCog, CalendarCheck, LifeBuoy, MessageCircleQuestion, FileText, CreditCard, BarChart3, Layers, ChevronDown, ClipboardList, Warehouse, Settings2, Headset } from 'lucide-react'
import NotificationBell from '../components/NotificationBell.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { Brand } from './PublicLayout.jsx'
import UserMenu from '../components/UserMenu.jsx'

// Business Manager chỉ làm việc với Facilities và Pricing; unit types / storage units là việc của cơ sở.
const INVENTORY = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'FACILITY_STAFF']
const PRICING = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'BUSINESS_MANAGER']
// Appointments / Support: vận hành tại cơ sở (Business Manager không tham gia).
const OPERATIONS = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'FACILITY_STAFF']
// Business Manager: XEM hợp đồng và thanh toán (chỉ đọc) để theo dõi kinh doanh; mỗi mục mở thẳng tab tương ứng.
const BM_ONLY = ['BUSINESS_MANAGER']

// Menu gom theo nhóm liên quan: bấm hoặc rê chuột vào một nhóm sẽ hiện bảng các mục bên trong.
const GROUPS = [
  { key: 'home', label: 'Tổng quan', icon: LayoutDashboard, to: '/admin', end: true },
  {
    key: 'inventory', label: 'Kho & giá', icon: Warehouse, items: [
      { to: '/admin/facilities', label: 'Cơ sở kho', icon: Building2 },
      { to: '/admin/unit-types', label: 'Loại kho', icon: Boxes, roles: INVENTORY },
      { to: '/admin/storage-units', label: 'Ô kho', icon: Package, roles: INVENTORY },
      { to: '/admin/facility-map', label: 'Sơ đồ cơ sở 2D/3D', icon: Layers, roles: ['SYSTEM_ADMIN', 'FACILITY_MANAGER'] },
      { to: '/admin/price-rules', label: 'Bảng giá', icon: Tag, roles: PRICING },
      { to: '/admin/policies', label: 'Chính sách', icon: FileText, roles: ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'BUSINESS_MANAGER'] },
    ],
  },
  {
    key: 'rentals', label: 'Thuê kho & hợp đồng', icon: ClipboardList, items: [
      { to: '/admin/reservations', label: 'Đơn thuê & hợp đồng', icon: CalendarCheck, roles: OPERATIONS },
      { to: '/admin/rental-contracts', label: 'Hợp đồng', icon: FileText, roles: BM_ONLY },
      { to: '/admin/payments', label: 'Thanh toán', icon: CreditCard, roles: BM_ONLY },
      { to: '/admin/contract-profiles', label: 'Hồ sơ hợp đồng', icon: FileText, roles: ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'BUSINESS_MANAGER'] },
      { to: '/admin/terminations', label: 'Hủy hợp đồng sớm', icon: FileText, roles: OPERATIONS },
    ],
  },
  {
    key: 'ops', label: 'Vận hành & hỗ trợ', icon: Headset, items: [
      { to: '/admin/appointments', label: 'Lịch hẹn', icon: CalendarCheck, roles: OPERATIONS },
      { to: '/admin/support-requests', label: 'Hỗ trợ khách', icon: LifeBuoy, roles: OPERATIONS },
      { to: '/admin/inquiries', label: 'Câu hỏi khách', icon: MessageCircleQuestion, roles: OPERATIONS },
    ],
  },
  { key: 'reports', label: 'Báo cáo', icon: BarChart3, to: '/admin/reports', roles: ['BUSINESS_MANAGER', 'SYSTEM_ADMIN'] },
  {
    key: 'system', label: 'Hệ thống', icon: Settings2, items: [
      { to: '/admin/users', label: 'Người dùng', icon: Users, roles: ['SYSTEM_ADMIN'] },
      { to: '/admin/facility-assignments', label: 'Phân công cơ sở', icon: UserCog, roles: ['SYSTEM_ADMIN'] },
    ],
  },
]

const allowed = (n, role) => !n.roles || n.roles.includes(role)

/** Thanh menu bên trái: nhóm mục liên quan, bấm vào nhóm để xổ danh sách mục con ngay bên dưới. */
function SideMenu({ role, pathname }) {
  const groups = GROUPS
    .map((g) => (g.items ? { ...g, items: g.items.filter((n) => allowed(n, role)) } : g))
    .filter((g) => (g.items ? g.items.length > 0 : allowed(g, role)))
  const insideKey = groups.find((g) => g.items?.some((n) => pathname.startsWith(n.to)))?.key
  const [openKey, setOpenKey] = useState(insideKey || null)
  useEffect(() => { if (insideKey) setOpenKey(insideKey) }, [insideKey])

  return (
    <nav className="side-nav" aria-label="Menu quản lý">
      {groups.map((g) => {
        const Icon = g.icon
        if (!g.items) {
          return (
            <NavLink key={g.key} to={g.to} end={g.end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <Icon size={19} /> {g.label}
            </NavLink>
          )
        }
        const expanded = openKey === g.key
        return (
          <div key={g.key} className="side-section">
            <button type="button" className={`side-link side-group ${insideKey === g.key ? 'active' : ''} ${expanded ? 'open' : ''}`}
              onClick={() => setOpenKey(expanded ? null : g.key)} aria-expanded={expanded}>
              <Icon size={19} /> <span>{g.label}</span> <ChevronDown size={16} className="side-chev" />
            </button>
            {expanded && (
              <div className="side-sub">
                {g.items.map(({ to, label, icon: ItemIcon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `side-sub-link ${isActive ? 'active' : ''}`}>
                    <ItemIcon size={16} /> {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState(false) // máy tính: thanh menu ẩn, rê chuột sát mép trái mới hiện
  const hideTimer = useRef(null)
  const showPeek = () => { clearTimeout(hideTimer.current); setPeek(true) }
  const hidePeek = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setPeek(false), 250) }
  const { pathname } = useLocation()
  const { user } = useAuth()
  useEffect(() => { setOpen(false); setPeek(false) }, [pathname])

  return (
    <div className="admin">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="side-hot" onMouseEnter={showPeek} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''} ${peek ? 'peek' : ''}`} onMouseEnter={showPeek} onMouseLeave={hidePeek}>
        <Brand to="/admin" />
        <SideMenu role={user?.role} pathname={pathname} />
      </aside>
      <div className="admin-main">
        <div className="admin-top">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu size={22} /></button>
          <strong>SafeSpace Quản lý</strong>
        </div>
        <div className="admin-bar">
          <Link to="/" className="admin-home-btn" title="Mở trang web dành cho khách"><Home size={17} /> <span>Trang chủ</span></Link>
          <NotificationBell />
          <UserMenu compact inAdmin />
        </div>
        <div className="admin-content"><Outlet /></div>
      </div>
    </div>
  )
}

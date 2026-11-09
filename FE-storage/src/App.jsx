import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import Home from './pages/Home.jsx'
import Locations from './pages/Locations.jsx'
import StorageOptions from './pages/StorageOptions.jsx'
import About from './pages/About.jsx'
import Contact from './pages/Contact.jsx'
import NotFound from './pages/NotFound.jsx'
import Profile from './pages/Profile.jsx'
import FacilityDetail from './pages/FacilityDetail.jsx'
import UnitTypeDetail from './pages/UnitTypeDetail.jsx'
import Services from './pages/Services.jsx'
import Pricing from './pages/Pricing.jsx'
import Checkout from './pages/Checkout.jsx'
import { ReservationList, ReservationDetail } from './pages/account/Reservations.jsx'
import MyUnits from './pages/account/MyUnits.jsx'
import Payments from './pages/account/Payments.jsx'
import Contracts from './pages/account/Contracts.jsx'
import Appointments from './pages/account/Appointments.jsx'
import Support from './pages/account/Support.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import OAuthCallback from './pages/OAuthCallback.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import ConfirmEmail from './pages/ConfirmEmail.jsx'
import Users from './pages/admin/Users.jsx'
import FacilityAssignments from './pages/admin/FacilityAssignments.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import Facilities from './pages/admin/Facilities.jsx'
import UnitTypes from './pages/admin/UnitTypes.jsx'
import StorageUnits from './pages/admin/StorageUnits.jsx'
import PriceRules from './pages/admin/PriceRules.jsx'
import AdminAppointments from './pages/admin/Appointments.jsx'
import AdminSupportRequests from './pages/admin/SupportRequests.jsx'
import ReservationManagement from './pages/admin/ReservationManagement.jsx'
import AskSupport from './pages/AskSupport.jsx'
import AdminInquiries from './pages/admin/Inquiries.jsx'

// Vai trò được vào từng nhóm trang quản lý (khớp menu ở AdminLayout và @PreAuthorize ở BE).
const INVENTORY = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'FACILITY_STAFF']
const PRICING = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'BUSINESS_MANAGER']
const OPERATIONS = ['SYSTEM_ADMIN', 'FACILITY_MANAGER', 'FACILITY_STAFF']
// Đơn đặt chỗ / hợp đồng / thanh toán: Business Manager được XEM để theo dõi kinh doanh (BE cho phép GET).
const BUSINESS_VIEW = [...OPERATIONS, 'BUSINESS_MANAGER']
const ADMIN_ONLY = ['SYSTEM_ADMIN']

const PublicPageWrap = ({ children }) => (
  <section className="section">
    <div className="container">{children}</div>
  </section>
)

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="locations" element={<Locations />} />
        <Route path="locations/:id" element={<FacilityDetail />} />
        <Route path="locations/:facilityId/unit-types/:typeId" element={<UnitTypeDetail />} />
        <Route path="storage-options" element={<StorageOptions />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="contact" element={<Contact />} />
        <Route path="support" element={<AskSupport />} />
        <Route path="profile" element={<RequireAuth any><Profile /></RequireAuth>} />
        <Route path="checkout" element={<RequireAuth any customer><Checkout /></RequireAuth>} />
        {/* Hỗ trợ đầy đủ route /my/... trong PublicLayout theo đúng đặc tả Member 3 & Member 4 */}
        <Route path="my/reservations" element={<RequireAuth any customer><PublicPageWrap><ReservationList /></PublicPageWrap></RequireAuth>} />
        <Route path="my/reservations/new" element={<RequireAuth any customer><Checkout /></RequireAuth>} />
        <Route path="my/reservations/:id" element={<RequireAuth any customer><PublicPageWrap><ReservationDetail /></PublicPageWrap></RequireAuth>} />
        <Route path="my/rentals" element={<RequireAuth any customer><PublicPageWrap><Contracts /></PublicPageWrap></RequireAuth>} />
        {/* Trang Contracts mới gom mọi thao tác (ký, hóa đơn, gia hạn) trong một danh sách, nên chi tiết đưa về danh sách. */}
        <Route path="my/rentals/:id" element={<Navigate to="/account/contracts" replace />} />
        <Route path="my/units" element={<RequireAuth any customer><PublicPageWrap><MyUnits /></PublicPageWrap></RequireAuth>} />
        <Route path="my/payments" element={<RequireAuth any customer><PublicPageWrap><Payments /></PublicPageWrap></RequireAuth>} />
        <Route path="my/appointments" element={<RequireAuth any customer><PublicPageWrap><Appointments /></PublicPageWrap></RequireAuth>} />
        <Route path="my/support" element={<RequireAuth any customer><PublicPageWrap><Support /></PublicPageWrap></RequireAuth>} />
        {/* Trang của khách: dùng thanh menu trên (menu "My Storage"), không còn thanh bên riêng. */}
        <Route path="account" element={<RequireAuth any customer><PublicPageWrap><Outlet /></PublicPageWrap></RequireAuth>}>
          <Route index element={<Navigate to="reservations" replace />} />
          <Route path="reservations" element={<ReservationList />} />
          <Route path="reservations/:id" element={<ReservationDetail />} />
          <Route path="units" element={<MyUnits />} />
          <Route path="rentals" element={<Contracts />} />
          <Route path="rentals/:id" element={<Navigate to="/account/contracts" replace />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="contracts/:id" element={<Navigate to="/account/contracts" replace />} />
          <Route path="payments" element={<Payments />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="support" element={<Support />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="oauth2/callback" element={<OAuthCallback />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="confirm-email" element={<ConfirmEmail />} />
      <Route path="admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="unit-types" element={<RequireAuth roles={INVENTORY}><UnitTypes /></RequireAuth>} />
        <Route path="storage-units" element={<RequireAuth roles={INVENTORY}><StorageUnits /></RequireAuth>} />
        <Route path="price-rules" element={<RequireAuth roles={PRICING}><PriceRules /></RequireAuth>} />
        <Route path="users" element={<RequireAuth roles={ADMIN_ONLY}><Users /></RequireAuth>} />
        <Route path="reservations" element={<RequireAuth roles={BUSINESS_VIEW}><ReservationManagement /></RequireAuth>} />
        <Route path="rental-contracts" element={<RequireAuth roles={BUSINESS_VIEW}><ReservationManagement /></RequireAuth>} />
        <Route path="payments" element={<RequireAuth roles={BUSINESS_VIEW}><ReservationManagement /></RequireAuth>} />
        <Route path="overdue" element={<RequireAuth roles={BUSINESS_VIEW}><ReservationManagement /></RequireAuth>} />
        <Route path="appointments" element={<RequireAuth roles={OPERATIONS}><AdminAppointments /></RequireAuth>} />
        <Route path="support-requests" element={<RequireAuth roles={OPERATIONS}><AdminSupportRequests /></RequireAuth>} />
        <Route path="inquiries" element={<RequireAuth roles={OPERATIONS}><AdminInquiries /></RequireAuth>} />
        <Route path="facility-assignments" element={<RequireAuth roles={ADMIN_ONLY}><FacilityAssignments /></RequireAuth>} />
        <Route path="*" element={<NotFound admin />} />
      </Route>
    </Routes>
  )
}

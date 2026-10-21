import { Routes, Route, Navigate } from 'react-router-dom'
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
import AccountLayout from './layouts/AccountLayout.jsx'
import { ReservationList, ReservationDetail } from './pages/account/Reservations.jsx'
import MyUnits from './pages/account/MyUnits.jsx'
import Payments from './pages/account/Payments.jsx'
import Appointments from './pages/account/Appointments.jsx'
import Support from './pages/account/Support.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
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
        <Route path="profile" element={<RequireAuth any><Profile /></RequireAuth>} />
        <Route path="checkout" element={<RequireAuth any><Checkout /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="confirm-email" element={<ConfirmEmail />} />
      <Route path="account" element={<RequireAuth any><AccountLayout /></RequireAuth>}>
        <Route index element={<Navigate to="reservations" replace />} />
        <Route path="reservations" element={<ReservationList />} />
        <Route path="reservations/:id" element={<ReservationDetail />} />
        <Route path="units" element={<MyUnits />} />
        <Route path="payments" element={<Payments />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="support" element={<Support />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="unit-types" element={<UnitTypes />} />
        <Route path="storage-units" element={<StorageUnits />} />
        <Route path="price-rules" element={<PriceRules />} />
        <Route path="users" element={<Users />} />
        <Route path="appointments" element={<AdminAppointments />} />
        <Route path="support-requests" element={<AdminSupportRequests />} />
        <Route path="facility-assignments" element={<FacilityAssignments />} />
        <Route path="*" element={<NotFound admin />} />
      </Route>
    </Routes>
  )
}

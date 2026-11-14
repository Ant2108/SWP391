import { Link } from 'react-router-dom'
import {
  Building2, Package, CheckCircle2, Tag, Users, UserCheck, CalendarCheck, LifeBuoy, AlertTriangle, KeyRound,
  Layers, ArrowRight, TrendingUp, DollarSign, Truck, FileText, ClipboardList,
} from 'lucide-react'
import { PageHeader, Card, Button, LoadingState, ErrorState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { api, UNIT_STATUSES } from '../../api/client.js'
import { label, money } from '../../utils/format.js'

// Các khoản được tính là doanh thu (tiền cọc không tính: cọc được hoàn lại cuối hợp đồng).
const REVENUE_TYPES = ['RENTAL', 'RENEWAL', 'OVERDUE_FEE', 'EXTRA_FEE', 'DAMAGE_FEE']

const quickLink = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12,
  background: 'var(--surface-2, #F8FAFC)', border: '1px solid var(--border, #E2E8F0)',
}

function Quick({ to, icon: Icon, color, children }) {
  return (
    <Link to={to} style={quickLink}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}><Icon size={18} color={color} /> {children}</span>
      <ArrowRight size={16} />
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const role = user?.role || 'FACILITY_STAFF'

  const { data, loading, error, reload } = useAsync(async () => {
    const [facilities, units, rules, appts, contracts, payments, supportReqs] = await Promise.all([
      api.facilities.list().catch(() => []),
      api.storageUnits.search({}).catch(() => []),
      api.priceRules.list().catch(() => []),
      api.appointments.list({}).catch(() => []),
      api.rentalContracts.list({}).catch(() => []),
      api.payments.list({}).catch(() => []),
      api.supportRequests.list({ status: 'OPEN' }).catch(() => []),
    ])
    return { facilities, units, rules, appts, contracts, payments, supportReqs }
  })

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const { facilities, units, rules, appts, contracts, payments, supportReqs } = data

  const count = (s) => units.filter((u) => u.status === s).length
  const occupiedTotal = count('OCCUPIED') + count('RESERVED')
  const occupancyRate = units.length ? Math.round((occupiedTotal / units.length) * 100) : 0

  const totalRevenue = payments
    .filter((p) => p.status === 'PAID' && REVENUE_TYPES.includes(p.paymentType))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const overdueCount = contracts.filter((c) => c.status === 'OVERDUE').length
  const scheduled = appts.filter((a) => a.status === 'SCHEDULED')
  const checkIns = scheduled.filter((a) => a.appointmentType === 'CHECK_IN')
  const returns = scheduled.filter((a) => a.appointmentType === 'RETURN')
  const isBusiness = role === 'BUSINESS_MANAGER' || role === 'SYSTEM_ADMIN'

  return (
    <>
      <PageHeader
        title={
          role === 'FACILITY_STAFF' ? 'Không gian làm việc của nhân viên'
            : role === 'FACILITY_MANAGER' ? 'Không gian làm việc của quản lý cơ sở'
              : role === 'BUSINESS_MANAGER' ? 'Bảng điều khiển kinh doanh'
                : 'Bảng điều khiển quản trị hệ thống'
        }
        subtitle={`Xin chào, ${user?.fullname || user?.email}. Đây là tóm tắt hoạt động của bạn.`}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {role === 'FACILITY_STAFF' && <Button as={Link} to="/admin/appointments"><CalendarCheck size={16} /> Lịch hẹn hôm nay</Button>}
            {role === 'FACILITY_MANAGER' && <Button as={Link} to="/admin/facility-map"><Layers size={16} /> Sơ đồ cơ sở 2D/3D</Button>}
            {isBusiness && <Button as={Link} to="/admin/reports"><TrendingUp size={16} /> Xem báo cáo</Button>}
            {role === 'SYSTEM_ADMIN' && <Button as={Link} to="/admin/users" variant="secondary"><Users size={16} /> Quản lý người dùng</Button>}
          </div>
        }
      />

      {role === 'FACILITY_STAFF' && (
        <div className="grid grid-4" style={{ marginBottom: 28 }}>
          <Card className="stat-card">
            <div className="stat-label"><CalendarCheck size={18} color="#F5C542" /> Nhận kho hôm nay</div>
            <div className="stat-num">{checkIns.length}</div>
            <div className="field-hint">Lịch hẹn nhận kho đang chờ</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><Truck size={18} color="#38BDF8" /> Trả kho hôm nay</div>
            <div className="stat-num">{returns.length}</div>
            <div className="field-hint">Lịch trả kho cần kiểm tra</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><LifeBuoy size={18} color="#D97706" /> Yêu cầu hỗ trợ đang mở</div>
            <div className="stat-num">{supportReqs.length}</div>
            <div className="field-hint">Đang chờ phản hồi</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><CheckCircle2 size={18} color="#15803D" /> Ô kho còn trống</div>
            <div className="stat-num" style={{ color: '#15803D' }}>{count('AVAILABLE')}</div>
            <div className="field-hint">Trống và sẵn sàng bàn giao</div>
          </Card>
        </div>
      )}

      {role === 'FACILITY_MANAGER' && (
        <div className="grid grid-4" style={{ marginBottom: 28 }}>
          <Card className="stat-card">
            <div className="stat-label"><Building2 size={18} color="#E5A900" /> Tỷ lệ sử dụng kho</div>
            <div className="stat-num">{occupancyRate}%</div>
            <div className="field-hint">{occupiedTotal} / {units.length} ô đang thuê hoặc giữ chỗ</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><CheckCircle2 size={18} color="#15803D" /> Ô kho còn trống</div>
            <div className="stat-num" style={{ color: '#15803D' }}>{count('AVAILABLE')}</div>
            <div className="field-hint">Sẵn sàng cho khách đặt</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><AlertTriangle size={18} color="#DC2626" /> Hợp đồng quá hạn</div>
            <div className="stat-num" style={{ color: overdueCount > 0 ? '#DC2626' : 'inherit' }}>{overdueCount}</div>
            <div className="field-hint">Cần theo dõi thanh toán</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><DollarSign size={18} color="#15803D" /> Doanh thu đã thu</div>
            <div className="stat-num" style={{ fontSize: 24, color: '#15803D' }}>{money(totalRevenue)}</div>
            <div className="field-hint">Không gồm tiền cọc</div>
          </Card>
        </div>
      )}

      {isBusiness && (
        <div className="grid grid-4" style={{ marginBottom: 28 }}>
          <Card className="stat-card">
            <div className="stat-label"><Building2 size={18} color="#E5A900" /> Cơ sở đang hoạt động</div>
            <div className="stat-num">{facilities.filter((f) => f.status === 'ACTIVE').length}</div>
            <div className="field-hint">Trên toàn hệ thống</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><Package size={18} /> Tổng số ô kho</div>
            <div className="stat-num">{units.length}</div>
            <div className="field-hint">Tỷ lệ sử dụng {occupancyRate}%</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><DollarSign size={18} color="#15803D" /> Doanh thu đã thu</div>
            <div className="stat-num" style={{ fontSize: 24, color: '#15803D' }}>{money(totalRevenue)}</div>
            <div className="field-hint">Không gồm tiền cọc</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label"><Tag size={18} color="#D97706" /> Luật giá đang áp dụng</div>
            <div className="stat-num">{rules.filter((r) => r.active).length}</div>
            <div className="field-hint">Giá thuê, phí và giảm giá</div>
          </Card>
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 28 }}>
        <Card>
          <h3>Tình trạng ô kho</h3>
          <p className="muted small" style={{ marginBottom: 16 }}>Phân bố ô kho hiện tại.</p>
          <div className="bar-list">
            {UNIT_STATUSES.map((s) => {
              const c = count(s)
              const pct = units.length ? Math.round((c / units.length) * 100) : 0
              return (
                <div className="bar-row" key={s}>
                  <span style={{ fontWeight: 500 }}>{label(s)}</span>
                  <div className="bar">
                    <i style={{ width: `${pct}%`, background: s === 'AVAILABLE' ? '#15803D' : s === 'RESERVED' ? '#D97706' : s === 'OCCUPIED' ? '#64748B' : '#DC2626' }} />
                  </div>
                  <strong>{c} ({pct}%)</strong>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(role === 'FACILITY_MANAGER' || role === 'FACILITY_STAFF') && (
              <Button as={Link} to="/admin/storage-units" variant="secondary" size="sm">Quản lý ô kho <ArrowRight size={14} /></Button>
            )}
            {(role === 'FACILITY_MANAGER' || role === 'SYSTEM_ADMIN') && (
              <Button as={Link} to="/admin/facility-map" variant="secondary" size="sm">Mở sơ đồ 2D/3D</Button>
            )}
          </div>
        </Card>

        <Card>
          <h3>Thao tác nhanh theo vai trò</h3>
          <p className="muted small" style={{ marginBottom: 16 }}>Những việc thường làm hằng ngày của bạn.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {role === 'FACILITY_STAFF' && (
              <>
                <Quick to="/admin/appointments" icon={KeyRound} color="#D97706">Nhận kho và bàn giao chìa khóa</Quick>
                <Quick to="/admin/appointments" icon={ClipboardList} color="#38BDF8">Kiểm tra và ghi nhận trả kho</Quick>
                <Quick to="/admin/support-requests" icon={LifeBuoy} color="#DC2626">Xử lý yêu cầu hỗ trợ đang mở ({supportReqs.length})</Quick>
              </>
            )}
            {role === 'FACILITY_MANAGER' && (
              <>
                <Quick to="/admin/facility-map" icon={Layers} color="#E5A900">Sơ đồ quản lý cơ sở 2D/3D</Quick>
                <Quick to="/admin/appointments" icon={UserCheck} color="#15803D">Phân công nhân viên cho lịch hẹn</Quick>
                <Quick to="/admin/reservations" icon={FileText} color="#2563EB">Đơn thuê, hợp đồng và thanh toán</Quick>
              </>
            )}
            {isBusiness && (
              <>
                <Quick to="/admin/facilities" icon={Building2} color="#E5A900">Quản lý cơ sở kho</Quick>
                <Quick to="/admin/price-rules" icon={Tag} color="#15803D">Cấu hình bảng giá</Quick>
                <Quick to="/admin/policies" icon={FileText} color="#7C3AED">Chính sách cọc, hủy và gia hạn</Quick>
                <Quick to="/admin/reports" icon={TrendingUp} color="#2563EB">Báo cáo doanh thu và tỷ lệ sử dụng</Quick>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

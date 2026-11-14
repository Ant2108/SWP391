export const money = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')} ₫`
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—')
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Tên tiếng Việt cho các giá trị enum của hệ thống (trạng thái, loại, vai trò...) hiển thị trên giao diện.
export const ENUM_VI = {
  // trạng thái chung
  ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động', AVAILABLE: 'Còn trống', RESERVED: 'Đã giữ chỗ', OCCUPIED: 'Đang thuê',
  MAINTENANCE: 'Bảo trì', BLOCKED: 'Tạm khóa', INSPECTION: 'Đang kiểm tra', COMING_SOON: 'Sắp ra mắt', OUT_OF_STOCK: 'Hết kho',
  // đơn, hợp đồng, thanh toán
  PENDING: 'Chờ xử lý', CONFIRMED: 'Đã gán ô kho', ASSIGNED: 'Đã gán ô kho', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  OVERDUE: 'Quá hạn', PAID: 'Đã thanh toán', FAILED: 'Đã hủy', REFUNDED: 'Đã hoàn cọc',
  // lịch hẹn
  SCHEDULED: 'Đã đặt lịch', NO_SHOW: 'Khách không đến', CHECK_IN: 'Nhận kho', RETURN: 'Trả kho', SUPPORT: 'Hỗ trợ',
  // hỗ trợ
  OPEN: 'Mới mở', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng',
  LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp',
  UNIT: 'Ô kho', LOCK: 'Khóa', KEY: 'Chìa khóa', ACCESS_CARD: 'Thẻ ra vào', ACCESS_CODE: 'Mã ra vào', PAYMENT: 'Thanh toán',
  STORED_ITEM: 'Đồ lưu kho', OTHER: 'Khác',
  // hồ sơ hợp đồng
  DRAFT: 'Đang soạn', SUBMITTED: 'Đã gửi', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối',
  // hư hại
  REPORTED: 'Đã báo cáo', FEE_ISSUED: 'Đã chốt phí',
  // vai trò
  CUSTOMER: 'Khách hàng', FACILITY_STAFF: 'Nhân viên cơ sở', FACILITY_MANAGER: 'Quản lý cơ sở',
  BUSINESS_MANAGER: 'Quản lý kinh doanh', SYSTEM_ADMIN: 'Quản trị hệ thống',
  // loại giá và cách tính
  RENTAL: 'Giá thuê', DEPOSIT: 'Tiền cọc', RENEWAL: 'Gia hạn', OVERDUE_FEE: 'Phí quá hạn', EXTRA_FEE: 'Phụ phí', DAMAGE_FEE: 'Phí hư hại',
  DISCOUNT: 'Giảm giá', PER_MONTH: 'Theo tháng', PER_DAY: 'Theo ngày', FIXED: 'Cố định', PERCENTAGE: 'Phần trăm',
}
// Khoản phí được miễn vẫn có trạng thái FAILED nhưng có waivedAt: hiển thị là "Đã miễn".
export const paymentStatusLabel = (p) => (p?.waivedAt ? 'Đã miễn' : (ENUM_VI[p?.status] || String(p?.status || '')))
export const label = (s) => ENUM_VI[s] || String(s || '').replace(/_/g, ' ')

// Tên loại kho trong dữ liệu là tiếng Anh (SMALL, MEDIUM...): hiển thị bằng tiếng Việt cho khách và nhân viên.
const TYPE_VI = { SMALL: 'Nhỏ', MEDIUM: 'Vừa', LARGE: 'Lớn', EXTRA_LARGE: 'Rất lớn', 'EXTRA LARGE': 'Rất lớn', XL: 'Rất lớn' }
export const unitTypeLabel = (n) => TYPE_VI[String(n || '').trim().toUpperCase()] || n

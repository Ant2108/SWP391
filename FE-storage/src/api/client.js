const BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

const STATUS_TEXT = {
  400: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại thông tin.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy.',
  409: 'Dữ liệu bị xung đột với dữ liệu đã có.',
  500: 'Lỗi máy chủ. Vui lòng thử lại sau.',
  502: 'Không kết nối được máy chủ. Vui lòng kiểm tra backend đang chạy.',
  504: 'Không kết nối được máy chủ. Vui lòng kiểm tra backend đang chạy.',
}

// BE trả { message, error } (+ từng field lỗi khi validation fail).
function errorMessage(status, data) {
  const msg = typeof data?.message === 'string' && data.message.trim() ? data.message : null
  if (msg && msg !== 'Internal server error') return msg
  return STATUS_TEXT[status] || data?.error || `Yêu cầu thất bại (${status})`
}

const KEY = 'auth'

export const authStore = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ } },
}

let refreshing = null
function refreshAccessToken() {
  const auth = authStore.get()
  if (!auth?.refreshToken) return Promise.resolve(false)
  refreshing ??= fetch(BASE + '/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) return false
      const d = await r.json()
      authStore.set({ ...auth, accessToken: d.accessToken })
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

async function send(method, path, body, withToken = true) {
  const token = withToken ? authStore.get()?.accessToken : null
  const headers = {}
  // FormData (upload file): để trình duyệt tự đặt Content-Type kèm boundary.
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra backend đang chạy.', 0)
  }
}

async function request(method, path, body, { auth = true } = {}) {
  let res = await send(method, path, body, auth)
  if (res.status === 401 && auth && authStore.get()) {
    if (await refreshAccessToken()) res = await send(method, path, body)
    if (res.status === 401) {
      authStore.clear()
      window.dispatchEvent(new Event('auth:expired'))
    }
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text ? { message: text } : null }
  if (!res.ok) throw new ApiError(errorMessage(res.status, data), res.status, data)
  return data
}

const qs = (params = {}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, v)
  })
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Ảnh upload được BE trả về dạng "/api/files/..."; nếu FE gọi BE ở host khác (VITE_API_URL) thì ghép lại host đó. */
export function assetUrl(u) {
  if (!u || !u.startsWith('/api/') || !/^https?:/.test(BASE)) return u
  return BASE.replace(/\/api\/?$/, '') + u
}

/** Tải ảnh riêng tư (CCCD) kèm token rồi trả về URL tạm để hiển thị trong thẻ <img>. */
export async function fetchPrivateImage(path) {
  const token = authStore.get()?.accessToken
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError('Không tải được ảnh', res.status)
  return URL.createObjectURL(await res.blob())
}

export const api = {
  contractProfiles: {
    get: (reservationId) => request('GET', `/contract-profiles/reservation/${reservationId}`),
    myRejected: () => request('GET', '/contract-profiles/my/rejected'),
    pendingReview: () => request('GET', '/contract-profiles/pending-review'),
    uploadIdImage: (reservationId, side, file) => {
      const f = new FormData()
      f.append('file', file)
      return request('POST', `/contract-profiles/reservation/${reservationId}/id-image?side=${side}`, f)
    },
    saveDraft: (reservationId, body) => request('PUT', `/contract-profiles/reservation/${reservationId}/draft`, body),
    submit: (reservationId, body) => request('PUT', `/contract-profiles/reservation/${reservationId}`, body),
    approve: (reservationId) => request('PATCH', `/contract-profiles/reservation/${reservationId}/approve`),
    reject: (reservationId, body) => request('PATCH', `/contract-profiles/reservation/${reservationId}/reject`, body),
  },
  files: {
    uploadImage: (file) => { const f = new FormData(); f.append('file', file); return request('POST', '/files/images', f) },
  },
  auth: {
    login: (email, password) => request('POST', '/auth/login', { email, password }, { auth: false }),
    logout: (refreshToken) => request('POST', '/auth/logout', { refreshToken }, { auth: false }),
    register: (b) => request('POST', '/auth/register', b, { auth: false }),
    me: () => request('GET', '/auth/me'),
    updateMe: (b) => request('PUT', '/auth/me', b),
    confirmEmailChange: (token) => request('POST', '/auth/confirm-email-change', { token }, { auth: false }),
    changePassword: (oldPassword, newPassword) => request('PUT', '/auth/change-password', { oldPassword, newPassword }),
    forgotPassword: (email) => request('POST', '/auth/forgot-password', { email }, { auth: false }),
    resetPassword: (token, newPassword) => request('POST', '/auth/reset-password', { token, newPassword }, { auth: false }),
  },
  users: {
    roles: () => request('GET', '/auth/admin/roles'),
    list: () => request('GET', '/auth/admin/users'),
    get: (id) => request('GET', `/auth/admin/users/${id}`),
    create: (b) => request('POST', '/auth/admin/users', b),
    update: (id, b) => request('PUT', `/auth/admin/users/${id}`, b),
    updateRole: (id, role) => request('PUT', `/auth/admin/users/${id}/role`, { role }),
    updateStatus: (id, status) => request('PUT', `/auth/admin/users/${id}/status`, { status }),
    remove: (id) => request('DELETE', `/auth/admin/users/${id}`),
  },
  facilityAssignments: {
    list: (facilityId) => request('GET', `/facility-assignments${qs({ facilityId })}`),
    create: (b) => request('POST', '/facility-assignments', b),
    update: (id, b) => request('PUT', `/facility-assignments/${id}`, b),
    remove: (id) => request('DELETE', `/facility-assignments/${id}`),
  },
  facilities: {
    // BE không có tham số lọc status nên lọc ở FE.
    list: async (status) => {
      const all = await request('GET', '/facilities')
      return status ? all.filter((f) => f.status === status) : all
    },
    get: (id) => request('GET', `/facilities/${id}`),
    create: (b) => request('POST', '/facilities', b),
    update: (id, b) => request('PUT', `/facilities/${id}`, b),
    disable: (id) => request('PATCH', `/facilities/${id}/disable`),
    enable: (id) => request('PATCH', `/facilities/${id}/enable`),
    remove: (id) => request('DELETE', `/facilities/${id}`),
  },
  unitTypes: {
    listByFacility: (facilityId) => request('GET', `/unit-types${qs({ facilityId })}`),
    create: (b) => request('POST', '/unit-types', b),
    update: (id, b) => request('PUT', `/unit-types/${id}`, b),
    disable: (id) => request('PATCH', `/unit-types/${id}/disable`),
    remove: (id) => request('DELETE', `/unit-types/${id}`),
  },
  storageUnits: {
    search: (filters) => request('GET', `/storage-units${qs(filters)}`),
    create: (b) => request('POST', '/storage-units', b),
    update: (id, b) => request('PUT', `/storage-units/${id}`, b),
    remove: (id) => request('DELETE', `/storage-units/${id}`),
    changeStatus: (id, status) => request('PATCH', `/storage-units/${id}/status`, { status }),
  },
  reports: {
    summary: (filters) => request('GET', `/reports/summary${qs(filters)}`),
  },
  terminations: {
    quote: (contractId) => request('GET', `/rental-contracts/${contractId}/termination-quote`),
    request: (contractId, b) => request('POST', `/rental-contracts/${contractId}/termination-request`, b),
    withdraw: (id) => request('POST', `/terminations/${id}/withdraw`),
    my: () => request('GET', '/terminations/my'),
    list: (status) => request('GET', `/terminations${qs({ status })}`),
    get: (id) => request('GET', `/terminations/${id}`),
    reject: (id, reason) => request('POST', `/terminations/${id}/reject`, { reason }),
    confirm: (id) => request('POST', `/terminations/${id}/confirm`),
  },
  policies: {
    get: () => request('GET', '/policies'),
    update: (b) => request('PUT', '/policies', b),
  },
  priceRules: {
    list: (filters) => request('GET', `/price-rules${qs(filters)}`),
    current: (filters) => request('GET', `/price-rules/current${qs(filters)}`),
    history: (filters) => request('GET', `/price-rules/history${qs(filters)}`),
    create: (b) => request('POST', '/price-rules', b),
    update: (id, b) => request('PUT', `/price-rules/${id}`, b),
    disable: (id) => request('PATCH', `/price-rules/${id}/disable`),
    remove: (id) => request('DELETE', `/price-rules/${id}`),
  },
  reservations: {
    my: () => request('GET', '/reservations/my'),
    quote: (params) => request('GET', `/reservations/quote${qs(params)}`),
    get: (id) => request('GET', `/reservations/${id}`),
    list: (filters) => request('GET', `/reservations${qs(filters)}`),
    create: (body) => request('POST', '/reservations', body),
    assignUnit: (id, storageUnitId) => request('PATCH', `/reservations/${id}/assign-unit`, { storageUnitId }),
    cancel: (id) => request('PATCH', `/reservations/${id}/cancel`),
  },
  rentalContracts: {
    my: () => request('GET', '/rental-contracts/my'),
    list: (filters) => request('GET', `/rental-contracts${qs(filters)}`),
    get: (id) => request('GET', `/rental-contracts/${id}`),
    createFromReservation: (reservationId) => request('POST', `/rental-contracts/from-reservation/${reservationId}`),
    sign: (id, body) => request('POST', `/rental-contracts/${id}/sign`, body),
    renew: (id, body) => request('POST', `/rental-contracts/${id}/renew`, body),
    renewalQuote: (id, months) => request('GET', `/rental-contracts/${id}/renewal-quote${qs({ months })}`),
    markOverdue: (id) => request('PATCH', `/rental-contracts/${id}/overdue`),
    processOverdue: () => request('POST', '/rental-contracts/overdue/process'),
    signAtCounter: (id, body) => request('POST', `/rental-contracts/${id}/sign-at-counter`, body),
    preSign: (reservationId, body) => request('POST', `/rental-contracts/reservation/${reservationId}/pre-sign`, body),
    withdrawPreSign: (reservationId) => request('DELETE', `/rental-contracts/reservation/${reservationId}/pre-sign`),
    uploadPreScan: (reservationId, url) => request('POST', `/rental-contracts/reservation/${reservationId}/signed-scan`, { url }),
    approvePreScan: (reservationId) => request('PATCH', `/rental-contracts/reservation/${reservationId}/signed-scan/approve`),
    rejectPreScan: (reservationId, reason) => request('PATCH', `/rental-contracts/reservation/${reservationId}/signed-scan/reject`, { reason }),
    uploadSignedScan: (id, url) => request('POST', `/rental-contracts/${id}/signed-scan`, { url }),
    approveSignedScan: (id) => request('PATCH', `/rental-contracts/${id}/signed-scan/approve`),
    rejectSignedScan: (id, reason) => request('PATCH', `/rental-contracts/${id}/signed-scan/reject`, { reason }),
    activate: (id) => request('PATCH', `/rental-contracts/${id}/activate`),
    complete: (id) => request('PATCH', `/rental-contracts/${id}/complete`),
  },
  payments: {
    list: (filters) => request('GET', `/payments${qs(filters)}`),
    my: () => request('GET', '/payments/my'),
    get: (id) => request('GET', `/payments/${id}`),
    forContract: (contractId) => request('GET', `/payments/contract/${contractId}`),
    create: (body) => request('POST', '/payments', body),
    submitReference: (id, params = {}) => request('PATCH', `/payments/${id}/submit-reference${qs(params)}`),
    simulateGateway: (id, params = {}) => request('POST', `/payments/${id}/simulate-gateway${qs(params)}`),
    markPaid: (id, params = {}) => request('PATCH', `/payments/${id}/paid${qs(params)}`),
    invoice: (id) => request('GET', `/payments/${id}/invoice`),
    waive: (id, reason) => request('PATCH', `/payments/${id}/waive`, { reason }),
    refundTransferred: (id, params = {}) => request('PATCH', `/payments/${id}/refund-transferred${qs(params)}`),
  },
  appointments: {
    slotCheck: (params) => request('GET', `/appointments/slot-check${qs(params)}`),
    bookingOptions: () => request('GET', '/appointments/booking-options'),
    staff: () => request('GET', '/appointments/staff'),
    my: () => request('GET', '/appointments/my'),
    list: (filters) => request('GET', `/appointments${qs(filters)}`),
    today: () => request('GET', '/appointments/today'),
    create: (b) => request('POST', '/appointments', b),
    assign: (id, staffId) => request('PATCH', `/appointments/${id}/assign`, { staffId }),
    complete: (id, b) => request('PATCH', `/appointments/${id}/complete`, b),
    cancel: (id) => request('PATCH', `/appointments/${id}/cancel`),
    reschedule: (id, scheduledAt) => request('PATCH', `/appointments/${id}/reschedule`, { scheduledAt }),
    markNoShow: (id) => request('PATCH', `/appointments/${id}/no-show`),
    reportNoShow: (id, note) => request('POST', `/appointments/${id}/report-no-show`, { note }),
  },
  unitReturns: {
    create: (b) => request('POST', '/unit-returns', b),
    get: (id) => request('GET', `/unit-returns/${id}`),
    damage: (filters) => request('GET', `/unit-returns/damage${qs(filters)}`),
    issueDamageFee: (id, itemFees) => request('PATCH', `/unit-returns/${id}/damage-fee`, { itemFees }),
  },
  supportRequests: {
    my: () => request('GET', '/support-requests/my'),
    list: (filters) => request('GET', `/support-requests${qs(filters)}`),
    create: (b) => request('POST', '/support-requests', b),
    assign: (id, staffId) => request('PATCH', `/support-requests/${id}/assign`, { staffId }),
    setStatus: (id, status) => request('PATCH', `/support-requests/${id}/status`, { status }),
    reply: (id, message) => request('POST', `/support-requests/${id}/replies`, { message }),
  },
  // Câu hỏi từ trang Support: gửi công khai (không cần đăng nhập), nhân viên xem và trả lời.
  inquiries: {
    create: (b) => request('POST', '/inquiries', b, { auth: false }),
    list: (filters) => request('GET', `/inquiries${qs(filters)}`),
    answer: (id, answer) => request('PATCH', `/inquiries/${id}/answer`, { answer }),
    my: () => request('GET', '/inquiries/my'),
  },
  // Chuông thông báo của người dùng đang đăng nhập.
  notifications: {
    my: () => request('GET', '/notifications/my'),
    unreadCount: () => request('GET', '/notifications/my/unread-count'),
    markRead: (id) => request('PATCH', `/notifications/${id}/read`),
    markAllRead: () => request('PATCH', '/notifications/read-all'),
  },
}

export const APPOINTMENT_TYPES = ['CHECK_IN', 'RETURN', 'SUPPORT']
export const APPOINTMENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
// Các loại hư hại staff tích khi kiểm tra kho trả (khớp enum DamageType ở backend).
export const DAMAGE_ITEMS = [
  ['DOOR', 'Cửa (hư hỏng, móp méo)'], ['LOCK', 'Khóa (hỏng, kẹt)'], ['WALL_FLOOR', 'Tường, sàn (hư hại)'],
  ['ROOF_LEAK', 'Mái (dột, rò nước)'], ['LIGHT_ELECTRIC', 'Đèn, điện (hỏng, chập)'],
  ['KEY_LOST', 'Chìa khóa (mất, chưa trả)'], ['LEFT_ITEMS', 'Đồ đạc, rác bỏ lại trong kho'], ['OTHER', 'Hư hại khác (ghi rõ bên dưới)'],
]
export const SUPPORT_TYPES = ['UNIT', 'LOCK', 'KEY', 'PAYMENT', 'STORED_ITEM', 'OTHER']
export const SUPPORT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

export const UNIT_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'INSPECTION', 'MAINTENANCE']

// Phải khớp UnitStatus.allowedNext() ở BE: các trạng thái được chuyển TỚI thủ công từ mỗi trạng thái.
export const NEXT_UNIT_STATUSES = {
  AVAILABLE: ['INSPECTION', 'MAINTENANCE'],
  RESERVED: ['AVAILABLE'],
  OCCUPIED: ['INSPECTION', 'MAINTENANCE'],
  INSPECTION: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'INSPECTION'],
}
export const PRICE_TYPES = ['RENTAL', 'DEPOSIT', 'RENEWAL', 'OVERDUE', 'EXTRA_FEE', 'DAMAGE_FEE', 'DISCOUNT']
export const PAYMENT_TYPES = ['DEPOSIT', 'RENTAL', 'RENEWAL', 'OVERDUE_FEE', 'EXTRA_FEE', 'DAMAGE_FEE']
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
export const CONTRACT_STATUSES = ['PENDING', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'CANCELLED']
export const RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']
export const CALC_TYPES = ['FIXED', 'PER_DAY', 'PER_MONTH', 'PERCENTAGE']

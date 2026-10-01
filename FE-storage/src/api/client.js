const BASE = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message)
    this.status = status
    this.data = data
  }
}

const STATUS_TEXT = {
  400: 'Invalid request. Please check your input.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'Not found.',
  409: 'This data conflicts with an existing record.',
  500: 'Server error. Please try again later.',
  502: 'Cannot reach the server. Please check that the backend is running.',
  504: 'Cannot reach the server. Please check that the backend is running.',
}

// BE trả { message, error } (+ từng field lỗi khi validation fail).
function errorMessage(status, data) {
  const msg = typeof data?.message === 'string' && data.message.trim() ? data.message : null
  if (msg && msg !== 'Internal server error') return msg
  return STATUS_TEXT[status] || data?.error || `Request failed (${status})`
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
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Please check that the backend is running.', 0)
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

export const api = {
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
    list: () => request('GET', '/facilities'),
    get: (id) => request('GET', `/facilities/${id}`),
    create: (b) => request('POST', '/facilities', b),
    update: (id, b) => request('PUT', `/facilities/${id}`, b),
    disable: (id) => request('PATCH', `/facilities/${id}/disable`),
  },
  unitTypes: {
    listByFacility: (facilityId) => request('GET', `/unit-types${qs({ facilityId })}`),
    create: (b) => request('POST', '/unit-types', b),
    update: (id, b) => request('PUT', `/unit-types/${id}`, b),
    disable: (id) => request('PATCH', `/unit-types/${id}/disable`),
  },
  storageUnits: {
    search: (filters) => request('GET', `/storage-units${qs(filters)}`),
    create: (b) => request('POST', '/storage-units', b),
    update: (id, b) => request('PUT', `/storage-units/${id}`, b),
    changeStatus: (id, status) => request('PATCH', `/storage-units/${id}/status`, { status }),
  },
  priceRules: {
    list: (filters) => request('GET', `/price-rules${qs(filters)}`),
    current: (filters) => request('GET', `/price-rules/current${qs(filters)}`),
    history: (filters) => request('GET', `/price-rules/history${qs(filters)}`),
    create: (b) => request('POST', '/price-rules', b),
    update: (id, b) => request('PUT', `/price-rules/${id}`, b),
    disable: (id) => request('PATCH', `/price-rules/${id}/disable`),
  },
}

export const UNIT_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'INSPECTION', 'MAINTENANCE']
export const PRICE_TYPES = ['RENTAL', 'DEPOSIT', 'RENEWAL', 'OVERDUE', 'EXTRA_FEE', 'DAMAGE_FEE', 'DISCOUNT']
export const CALC_TYPES = ['FIXED', 'PER_DAY', 'PER_MONTH', 'PERCENTAGE']

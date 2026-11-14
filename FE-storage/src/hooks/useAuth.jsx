import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, authStore } from '../api/client.js'

const AuthContext = createContext(null)

export const ADMIN_ROLES = ['SYSTEM_ADMIN', 'BUSINESS_MANAGER', 'FACILITY_MANAGER', 'FACILITY_STAFF']
export const isAdminRole = (role) => ADMIN_ROLES.includes(role)

// Login response chỉ có email/role; tên + SĐT lấy từ /auth/me rồi gộp vào auth đã lưu.
function mergeProfile(profile) {
  const auth = authStore.get()
  if (!auth) return null
  const next = {
    ...auth,
    userId: profile.id ?? auth.userId,
    fullname: profile.fullname,
    email: profile.email,
    phone: profile.phone,
    role: profile.role ?? auth.role,
    facilityId: profile.facilityId ?? null,
    facilityName: profile.facilityName ?? null,
  }
  authStore.set(next)
  return next
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStore.get())

  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const refreshProfile = useCallback(async () => {
    const next = mergeProfile(await api.auth.me())
    if (next) setUser(next)
    return next
  }, [])

  // Phiên đăng nhập cũ (trước khi có tên trong store) → tải bổ sung một lần.
  useEffect(() => {
    if (user?.accessToken && (!user.fullname || user.facilityId === undefined)) refreshProfile().catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hiệu ứng mở kho ở trang chủ chỉ chạy ngay sau khi khách vừa đăng nhập (không chạy khi đăng xuất).
  const markIntro = (data) => { try { if (data?.role === 'CUSTOMER') sessionStorage.setItem('ss-intro', '1') } catch { /* bỏ qua */ } }

  const login = useCallback(async (email, password) => {
    const data = await api.auth.login(email, password)
    authStore.set(data)
    markIntro(data)
    setUser(data)
    try { return (await refreshProfile()) || data } catch { return data }
  }, [refreshProfile])

  // Đăng nhập Google: BE đã chuyển về FE kèm token, chỉ cần lưu phiên rồi tải hồ sơ.
  const loginWithTokens = useCallback(async (data) => {
    authStore.set(data)
    markIntro(data)
    setUser(data)
    try { return (await refreshProfile()) || data } catch { return data }
  }, [refreshProfile])

  // Email mới chưa đổi ngay: BE trả pendingEmail và gửi link xác nhận tới email hiện tại.
  const updateProfile = useCallback(async (body) => {
    const res = await api.auth.updateMe(body)
    const next = mergeProfile(res)
    if (next) setUser(next)
    return res
  }, [])

  const logout = useCallback(async () => {
    const rt = authStore.get()?.refreshToken
    try { sessionStorage.removeItem('ss-intro') } catch { /* bỏ qua */ }
    authStore.clear()
    setUser(null)
    if (rt) { try { await api.auth.logout(rt) } catch { /* already signed out locally */ } }
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, loginWithTokens, logout, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

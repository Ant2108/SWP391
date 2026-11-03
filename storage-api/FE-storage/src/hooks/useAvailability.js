import { useAsync } from './useAsync.js'
import { api } from '../api/client.js'

/** Số ô còn trống theo từng facility: { [facilityId]: count }. `data` là null khi đang tải hoặc lỗi. */
export function useAvailability() {
  return useAsync(async () => {
    const units = await api.storageUnits.search({ status: 'AVAILABLE' })
    return units.reduce((m, u) => ({ ...m, [u.facilityId]: (m[u.facilityId] || 0) + 1 }), {})
  })
}

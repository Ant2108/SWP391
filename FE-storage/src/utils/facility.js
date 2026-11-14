// Nhãn và màu cho thuộc tính loại kho và tình trạng hàng của cơ sở.
export const STOCK_OPTIONS = [
  { value: 'AVAILABLE', label: 'Còn kho', tone: 'green' },
  { value: 'COMING_SOON', label: 'Sắp ra mắt', tone: 'yellow' },
  { value: 'OUT_OF_STOCK', label: 'Hết kho', tone: 'red' },
]

export const stockOf = (f) => STOCK_OPTIONS.find((o) => o.value === (f?.stockStatus || 'AVAILABLE')) || STOCK_OPTIONS[0]

/** Chỉ cho đặt kho khi cơ sở đang hoạt động và tình trạng hàng là AVAILABLE. */
export const canBook = (f) => !!f && f.status === 'ACTIVE' && (f.stockStatus || 'AVAILABLE') === 'AVAILABLE'

/**
 * Quận/khu vực của cơ sở, lấy từ địa chỉ: phần cuối trước tên thành phố.
 * "215 Võ Văn Tần, Phường 5, Quận 3, TP.HCM" -> "Quận 3"; "456 Võ Văn Ngân, Thủ Đức, TP.HCM" -> "Thủ Đức".
 */
export function districtOf(f) {
  const parts = String(f?.address || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length && /^(tp\.?\s*hcm|tp\.?\s*hồ chí minh|thành phố hồ chí minh|hồ chí minh)$/i.test(parts[parts.length - 1])) parts.pop()
  return parts.length > 1 ? parts[parts.length - 1] : 'Khác'
}

/** Gom cơ sở theo quận (giữ thứ tự xuất hiện), dùng cho ô chọn cơ sở có nhóm. */
export function groupByDistrict(facilities) {
  const groups = new Map()
  for (const f of facilities || []) {
    const d = districtOf(f)
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(f)
  }
  return [...groups.entries()].map(([district, items]) => ({ district, items }))
}

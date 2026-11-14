import { unitTypeLabel } from './format.js'
// Lọc loại kho theo từ khóa, kích thước và tình trạng còn trống.

export const SIZE_OPTIONS = [
  { value: '', label: 'Mọi kích cỡ' },
  { value: 'S', label: 'Nhỏ', hint: 'đến 5 m²' },
  { value: 'M', label: 'Vừa', hint: '5 – 13 m²' },
  { value: 'L', label: 'Lớn', hint: '13 – 30 m²' },
  { value: 'XL', label: 'Rất lớn', hint: 'trên 30 m²' },
]

export const EMPTY_FILTERS = { q: '', size: '', availableOnly: false }

// Tên loại kho hiển thị bằng tiếng Việt (SMALL → Nhỏ, MEDIUM → Vừa, LARGE → Lớn, EXTRA_LARGE → Rất lớn); tên khác giữ nguyên.
export const prettyType = (s) => unitTypeLabel(String(s ?? '').replace(/_+$/g, ''))

export const hasFilters = (f) => !!(f.q.trim() || f.size || f.availableOnly)

/** Diện tích sàn (m²) = rộng x dài; null nếu thiếu số đo. */
export const area = (t) => (t.width != null && t.length != null ? Number(t.width) * Number(t.length) : null)

/** "2.5 m²" từ rộng x dài; null nếu thiếu số đo. */
export const areaText = (t) => {
  const a = area(t)
  return a == null ? null : `${Number.isInteger(a) ? a : a.toFixed(1)} m²`
}

export function sizeBucket(t) {
  const a = area(t)
  if (a == null) return null
  return a <= 5 ? 'S' : a <= 13 ? 'M' : a <= 30 ? 'L' : 'XL'
}

// "3m x 3m", "3 × 3" và "3x3" đều quy về "3x3" để gõ kiểu nào cũng khớp.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, '').replace(/m(?=x|$)/g, '')

/**
 * @param items  mảng loại kho, mỗi phần tử có `units` (các ô còn trống)
 * @returns mảng đã lọc
 */
export function filterUnitTypes(items, f) {
  const q = norm(f.q)
  return items.filter((t) => {
    if (f.size && sizeBucket(t) !== f.size) return false
    if (f.availableOnly && !(t.units?.length > 0)) return false
    if (q) {
      const dimText = [t.width, t.length, t.height].filter((v) => v != null).join('x')
      const haystack = norm([
        t.typeName, t.description, t.sizeDescription, dimText,
        ...(t.units || []).flatMap((u) => [u.unitCode, u.location, u.floor && `floor${u.floor}`]),
      ].join(' '))
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

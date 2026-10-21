// Nhãn và màu cho thuộc tính loại kho và tình trạng hàng của cơ sở.
export const STOCK_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available', tone: 'green' },
  { value: 'COMING_SOON', label: 'Coming soon', tone: 'yellow' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock', tone: 'red' },
]

export const TYPE_LABELS = { STANDARD: 'Standard storage', COLD: 'Cold storage' }

export const stockOf = (f) => STOCK_OPTIONS.find((o) => o.value === (f?.stockStatus || 'AVAILABLE')) || STOCK_OPTIONS[0]

/** Chỉ cho đặt kho khi cơ sở đang hoạt động và tình trạng hàng là AVAILABLE. */
export const canBook = (f) => !!f && f.status === 'ACTIVE' && (f.stockStatus || 'AVAILABLE') === 'AVAILABLE'

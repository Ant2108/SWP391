export const money = (n) => `${Number(n || 0).toLocaleString('en-US')} ₫`
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '—')
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—')
export const label = (s) => String(s || '').replace(/_/g, ' ')

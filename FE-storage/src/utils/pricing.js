import { money } from './format.js'

const UNIT = { PER_MONTH: '/ month', PER_DAY: '/ day', FIXED: 'one-time', PERCENTAGE: '' }

export const priceText = (r) => (r ? (r.calculationType === 'PERCENTAGE' ? `${r.percentage}%` : `${money(r.amount)} ${UNIT[r.calculationType]}`) : '—')

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** Rule đang có hiệu lực hôm nay. */
export const inPeriod = (r, today = todayIso()) => r.active && r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today)

/** Rule cụ thể nhất thắng: (facility + unit type) > facility > toàn hệ thống. */
export function pickRule(rules, priceType, facilityId, unitTypeId) {
  const today = todayIso()
  const fits = (r) => r.priceType === priceType && inPeriod(r, today)
    && (r.facilityId == null || r.facilityId === facilityId)
    && (r.unitTypeId == null || r.unitTypeId === unitTypeId)
  const score = (r) => (r.unitTypeId != null ? 2 : 0) + (r.facilityId != null ? 1 : 0)
  return rules.filter(fits).sort((a, b) => score(b) - score(a) || b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null
}

/**
 * Giá thuê theo ngày của một rule RENTAL.
 *  - PER_DAY: giá đúng như cấu hình (exact = true).
 *  - PER_MONTH: quy đổi gần đúng = giá tháng / 30 (exact = false).
 *  - FIXED / PERCENTAGE: không quy ra theo ngày được -> null.
 */
export function dailyRate(rule) {
  if (!rule || rule.amount == null) return null
  const amount = Number(rule.amount)
  if (rule.calculationType === 'PER_DAY') return { amount, exact: true }
  if (rule.calculationType === 'PER_MONTH') return { amount: Math.round(amount / 30), exact: false }
  return null
}

/** Giá thuê theo tháng của một rule RENTAL (PER_DAY quy ra 30 ngày). */
export function monthlyRate(rule) {
  if (!rule || rule.amount == null) return null
  const amount = Number(rule.amount)
  if (rule.calculationType === 'PER_MONTH') return amount
  if (rule.calculationType === 'PER_DAY') return amount * 30
  return null
}

import { assetUrl } from '../api/client.js'
import { fmtDate, fmtDateTime, label, money } from './format.js'
import { DEFAULT_DEPOSIT_PERCENT, inPeriod, todayIso } from './pricing.js'

export const CONTRACT_STATUS_TEXT = {
  PENDING: 'Pending check-in',
  ACTIVE: 'Active',
  OVERDUE: 'Overdue',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const PAYMENT_TYPE_TEXT = {
  DEPOSIT: 'Deposit (Stage 1)',
  RENTAL: 'Rental payment (Stage 2)',
  RENEWAL: 'Contract renewal',
  OVERDUE_FEE: 'Overdue fee',
  EXTRA_FEE: 'Extra service fee',
  DAMAGE_FEE: 'Damage compensation fee',
}

export const PAYMENT_METHOD_TEXT = {
  BANK_TRANSFER: 'Bank transfer (VietQR)',
  VNPAY: 'VNPay QR',
  MOMO: 'MoMo Wallet',
  CARD: 'Bank card',
  CASH: 'Cash at counter',
}

// Giữ lại hàm maskContractCode để tương thích ngược nếu nơi khác import, nhưng trả về mã chuẩn #ID.
export function maskContractCode(c) {
  return `Contract #${c?.id || 1}`
}

export function officialContractNumber(c) {
  const id = String(c?.id || 1).padStart(4, '0')
  const year = c?.createdAt ? new Date(c.createdAt).getFullYear() : new Date().getFullYear()
  return `SS-${year}-${id}`
}

export function parseRenewalMonths(payment, monthlyPrice) {
  const ref = String(payment?.transactionReference || '')
  const match = ref.match(/RENEW_MONTHS:(\d+)/)
  if (match && match[1]) {
    const num = parseInt(match[1], 10)
    if (!Number.isNaN(num) && num > 0) return num
  }
  if (monthlyPrice && Number(monthlyPrice) > 0 && payment?.amount) {
    const est = Math.round(Number(payment.amount) / Number(monthlyPrice))
    if (est > 0) return est
  }
  return 1
}

export function sortRenewalsAscending(list = []) {
  return [...(list || [])].sort((a, b) => {
    const idA = Number(a?.id || 0)
    const idB = Number(b?.id || 0)
    if (idA !== idB) return idA - idB
    return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
  })
}

/**
 * Chuyển các mã tham chiếu hệ thống (RENEW_MONTHS, HOAN_COC, DOT_2...) thành dòng ghi chú tiếng Anh tự nhiên.
 */
export function formatPaymentNote(p) {
  const ref = String(p?.transactionReference || '').trim()
  if (!ref || ref === 'DOT_2_THANH_TOAN_FULL_KHO') return null

  if (ref.startsWith('HOAN_COC_100%')) {
    const val = Number(ref.split(':')[1])
    return {
      tone: 'green',
      text: !Number.isNaN(val) && val > 0 ? `100% deposit refunded (${money(val)})` : '100% deposit refunded',
    }
  }
  if (ref.startsWith('HOAN_COC_80%')) {
    const val = Number(ref.split(':')[1])
    return {
      tone: 'amber',
      text: !Number.isNaN(val) && val > 0
        ? `80% deposit refunded: ${money(val)} (20% late cancellation fee)`
        : '80% deposit refunded (20% late cancellation fee)',
    }
  }
  if (ref.startsWith('HOAN_COC_SAU_TRU_HU_HAI')) {
    const val = Number(ref.split(':')[1])
    return {
      tone: 'amber',
      text: !Number.isNaN(val) ? `Deposit refunded after damage deduction (${money(val)})` : 'Deposit refunded after damage deduction',
    }
  }
  if (ref.startsWith('HOAN_100%_TIEN_THUE_DOT_2')) {
    const val = Number(ref.split(':')[1])
    return {
      tone: 'green',
      text: !Number.isNaN(val) && val > 0 ? `100% stage 2 rental refunded (${money(val)})` : '100% stage 2 rental refunded',
    }
  }
  if (ref.startsWith('MAT_100%_COC') || ref.startsWith('KHAU_TRU_100%_COC')) {
    return { tone: 'red', text: 'Deposit forfeited / fully deducted' }
  }
  if (ref.startsWith('RENEW_MONTHS:')) {
    const m = parseRenewalMonths(p)
    const parts = ref.split('|').map((s) => s.trim())
    const customRef = parts.length > 1 ? parts.slice(1).join(' · ') : null
    return {
      tone: 'neutral',
      text: `Renewal (+${m} month${m > 1 ? 's' : ''})${customRef ? ` · Ref: ${customRef}` : ''}`,
    }
  }
  return { tone: 'neutral', text: `Ref: ${ref}` }
}

/**
 * Chọn rule cụ thể nhất đang có hiệu lực: (facility + unitType) > facility > toàn hệ thống.
 */
export function selectEffectiveRule(rules, priceType, facilityId, unitTypeId, dateIso = todayIso()) {
  if (!Array.isArray(rules)) return null
  const fits = (r) =>
    r.priceType === priceType &&
    inPeriod(r, dateIso) &&
    (r.facilityId == null || Number(r.facilityId) === Number(facilityId)) &&
    (r.unitTypeId == null || Number(r.unitTypeId) === Number(unitTypeId))
  const score = (r) => (r.unitTypeId != null ? 2 : 0) + (r.facilityId != null ? 1 : 0)
  return (
    rules
      .filter(fits)
      .sort((a, b) => score(b) - score(a) || String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0] || null
  )
}

/**
 * Tính tổng tiền thuê kho (Đợt 2) khớp 100% với ReservationService ở Backend (gồm RENTAL + DISCOUNT).
 */
export function calcRentalTotal(rules, facilityId, unitTypeId, months = 1, dateIso = todayIso()) {
  const m = Math.max(1, Number(months) || 1)
  const rentalRule = selectEffectiveRule(rules, 'RENTAL', facilityId, unitTypeId, dateIso)
  let base
  if (!rentalRule) {
    base = 1000000 * m
  } else if (rentalRule.calculationType === 'PER_MONTH') {
    base = Number(rentalRule.amount || 0) * m
  } else if (rentalRule.calculationType === 'PER_DAY') {
    base = Number(rentalRule.amount || 0) * m * 30
  } else {
    base = Number(rentalRule.amount || 0)
  }

  const discountRule = selectEffectiveRule(rules, 'DISCOUNT', facilityId, unitTypeId, dateIso)
  let discountAmount = 0
  if (discountRule) {
    if (discountRule.calculationType === 'PERCENTAGE' && discountRule.percentage != null) {
      discountAmount = Math.round((base * Number(discountRule.percentage)) / 100)
    } else if (discountRule.amount != null) {
      if (discountRule.calculationType === 'PER_MONTH') {
        discountAmount = Number(discountRule.amount) * m
      } else if (discountRule.calculationType === 'PER_DAY') {
        discountAmount = Number(discountRule.amount) * 30 * m
      } else {
        discountAmount = Number(discountRule.amount)
      }
    }
  }

  const finalTotal = Math.max(0, base - discountAmount)
  const effectiveMonthly = Math.round(finalTotal / m)
  return {
    baseTotal: base,
    discountRule,
    discountAmount,
    finalTotal,
    effectiveMonthly,
    rentalRule,
  }
}

/**
 * Tính tiền đặt cọc (Đợt 1) khớp 100% với ReservationService.resolveDepositAmount ở Backend.
 */
export function calcDepositAmount(rules, facilityId, unitTypeId, fullRentalAmount, dateIso = todayIso()) {
  const total = Number(fullRentalAmount) || 0
  const depRule = selectEffectiveRule(rules, 'DEPOSIT', facilityId, unitTypeId, dateIso)
  if (!depRule) {
    return {
      amount: Math.round(total * (DEFAULT_DEPOSIT_PERCENT / 100)),
      rule: null,
      note: `${DEFAULT_DEPOSIT_PERCENT}% of rental total`,
    }
  }
  if (depRule.calculationType === 'PERCENTAGE' && depRule.percentage != null) {
    return {
      amount: Math.round((total * Number(depRule.percentage)) / 100),
      rule: depRule,
      note: `${Number(depRule.percentage)}% of rental total`,
    }
  }
  if (depRule.amount != null && Number(depRule.amount) > 0) {
    return {
      amount: Number(depRule.amount),
      rule: depRule,
      note: 'fixed deposit rate',
    }
  }
  return {
    amount: Math.round(total * (DEFAULT_DEPOSIT_PERCENT / 100)),
    rule: depRule,
    note: `${DEFAULT_DEPOSIT_PERCENT}% of rental total`,
  }
}

/**
 * Tính phí gia hạn hợp đồng khớp 100% với RentalContractService.renew ở Backend.
 */
export function calcRenewalAmount(rules, contract, months = 1, dateIso = todayIso()) {
  const m = Math.max(1, Number(months) || 1)
  const monthlyPrice = Number(contract?.monthlyPrice || 1000000)
  const renewalRule = selectEffectiveRule(rules, 'RENEWAL', contract?.facilityId, contract?.unitTypeId, dateIso)
  if (!renewalRule) {
    return { amount: monthlyPrice * m, rule: null }
  }
  if (renewalRule.calculationType === 'PER_MONTH' && renewalRule.amount != null) {
    return { amount: Number(renewalRule.amount) * m, rule: renewalRule }
  }
  if (renewalRule.calculationType === 'PER_DAY' && renewalRule.amount != null) {
    return { amount: Number(renewalRule.amount) * m * 30, rule: renewalRule }
  }
  if (renewalRule.calculationType === 'PERCENTAGE' && renewalRule.percentage != null) {
    return { amount: Math.round((monthlyPrice * m * Number(renewalRule.percentage)) / 100), rule: renewalRule }
  }
  if (renewalRule.amount != null) {
    return { amount: Number(renewalRule.amount) * m, rule: renewalRule }
  }
  return { amount: monthlyPrice * m, rule: null }
}

/**
 * Tính số tháng thuê gốc (Đợt 2) và số tiền Đợt 2 của hợp đồng mà không bị sai lệch sau khi gia hạn.
 */
export function resolveInitialRentalTerms(contract) {
  let initialMonths = Number(contract?.rentalMonths || 0)
  if (!initialMonths || initialMonths <= 0) {
    if (contract?.startDate && contract?.endDate) {
      const s = new Date(contract.startDate)
      const e = new Date(contract.endDate)
      const diffDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
      initialMonths = Math.max(1, Math.round(diffDays / 30))
    } else {
      initialMonths = 1
    }
  }
  const stage2Amount =
    contract?.stage2RentalAmount != null
      ? Number(contract.stage2RentalAmount)
      : Number(contract?.monthlyPrice || 0) * initialMonths
  return { initialMonths, stage2Amount }
}

/**
 * Mở trang Hợp đồng A4 độc lập sang tab mới để xem hoặc xuất PDF / In.
 */
export function openContractInNewPage(
  contract,
  user,
  { autoPrint = false, fallbackSignatureUrl = '', fallbackSignerName = '', renewals = [] } = {}
) {
  if (!contract) return

  const sigUrl = contract.signatureUrl ? assetUrl(contract.signatureUrl) : fallbackSignatureUrl
  const signer = contract.signerName || fallbackSignerName || contract.customerName || user?.fullname || 'Customer'
  const signedTime = contract.signedAt ? fmtDateTime(contract.signedAt) : (sigUrl ? fmtDateTime(new Date().toISOString()) : '')
  const contractNo = officialContractNumber(contract)
  const createdDateStr = fmtDate(contract.createdAt || contract.startDate)
  const startDateStr = fmtDate(contract.startDate)
  const endDateStr = fmtDate(contract.endDate)
  const monthlyStr = money(contract.monthlyPrice)
  const depositStr = money(contract.depositAmount)
  const statusStr = CONTRACT_STATUS_TEXT[contract.status] || label(contract.status)

  const { initialMonths: monthsCount, stage2Amount } = resolveInitialRentalTerms(contract)
  const rawBaseRent = Number(contract.monthlyPrice || 0) * monthsCount
  const discountDiff = rawBaseRent > stage2Amount ? rawBaseRent - stage2Amount : 0
  const totalRentStr = money(stage2Amount)

  const orderedRenewals = sortRenewalsAscending(renewals)
  const renewalRowsHtml = orderedRenewals.length > 0
    ? `
      <div class="clause-title" style="color:#1d4ed8; margin-top:20px;">
        CONTRACT RENEWAL ADDENDUM
      </div>
      <div class="clause-body">
        <p>Renewal addenda attached to Contract <strong>#${contract.id} (${contractNo})</strong> for Unit <strong>${contract.unitCode || contract.storageUnitId}</strong>:</p>
        <table class="contract-table">
          <thead>
            <tr>
              <th>Addendum</th>
              <th>Extended Duration</th>
              <th>Renewal Fee</th>
              <th>Payment Status</th>
              <th>Date Recorded</th>
              <th>Updated End Date</th>
            </tr>
          </thead>
          <tbody>
            ${orderedRenewals
              .map((r, idx) => {
                const mCount = parseRenewalMonths(r, contract.monthlyPrice)
<<<<<<< Updated upstream
                const stText = r.status === 'PAID' ? 'Đã thanh toán (Có hiệu lực)' : r.status === 'PENDING' ? 'Chờ thanh toán' : r.status
                const plNum = String(idx + 1).padStart(2, '0')
                return `
                  <tr>
                    <td><strong>Phụ lục #${idx + 1} (PL-${plNum}/${shortCode})</strong></td>
                    <td><strong>+${mCount} tháng</strong></td>
=======
                const stText = r.status === 'PAID' ? 'Paid (Active)' : label(r.status)
                return `
                  <tr>
                    <td><strong>Addendum #${idx + 1}</strong></td>
                    <td><strong>+${mCount} month${mCount > 1 ? 's' : ''}</strong></td>
>>>>>>> Stashed changes
                    <td><strong>${money(r.amount)}</strong></td>
                    <td>${stText}</td>
                    <td>${fmtDateTime(r.paidAt || r.createdAt)}</td>
                    <td><strong>${endDateStr}</strong></td>
                  </tr>
                `
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Storage Rental Contract #${contract.id} - SafeSpace Storage</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 16mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 28px 16px 60px; background: #e2e8f0; font-family: "Times New Roman", Times, Georgia, serif; color: #0f172a; font-size: 13pt; line-height: 1.6; }
    .toolbar { max-width: 210mm; margin: 0 auto 18px; background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-family: system-ui, sans-serif; }
    .btn-print { background: #f9b800; color: #0f172a; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; }
    .btn-close { background: #334155; color: #ffffff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
    .a4-sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #ffffff; padding: 16mm 18mm; box-shadow: 0 12px 36px rgba(15, 23, 42, 0.18); border: 1px solid #cbd5e1; }
    .doc-border { border: 2px double #1e293b; padding: 22px 26px; min-height: 255mm; }
    .header-grid { display: grid; grid-template-columns: 48% 52%; border-bottom: 1.5px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px; text-align: center; }
    .contract-title { font-size: 18pt; font-weight: 700; text-transform: uppercase; margin: 12px 0 4px; text-align: center; }
    .party-box { margin-bottom: 14px; padding: 12px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; }
    .party-title { font-weight: 700; font-size: 12.5pt; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 12pt; }
    .party-grid .full { grid-column: span 2; }
    .clause-title { font-weight: 700; font-size: 12.5pt; text-transform: uppercase; margin: 14px 0 6px; }
    .clause-body { text-align: justify; font-size: 12pt; }
    .clause-body ul { margin: 6px 0; padding-left: 22px; }
    table.contract-table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 11.5pt; }
    table.contract-table th, table.contract-table td { border: 1px solid #334155; padding: 7px 10px; text-align: left; }
    table.contract-table th { background: #f1f5f9; font-weight: 700; }
    .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; padding-top: 16px; border-top: 1.5px solid #334155; page-break-inside: avoid; }
    .sig-col { text-align: center; padding: 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fcfcfd; min-height: 220px; display: flex; flex-direction: column; justify-content: space-between; }
    .sig-img { max-height: 110px; max-width: 240px; object-fit: contain; margin: 0 auto; display: block; }
    @media print { body { background: #ffffff; padding: 0; } .toolbar { display: none !important; } .a4-sheet { width: 100%; min-height: auto; margin: 0; padding: 0; border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>Storage Rental Contract #${contract.id} (${contractNo})</strong></div>
    <div style="display:flex; gap:10px;">
      <button class="btn-print" onclick="window.print()">Export PDF / Print Contract</button>
      <button class="btn-close" onclick="window.close()">Close tab</button>
    </div>
  </div>

  <div class="a4-sheet">
    <div class="doc-border">
      <div class="header-grid">
        <div>
          <div style="font-weight:700;">SAFESPACE STORAGE VIETNAM CO., LTD</div>
          <div style="margin-top:4px;">Contract No: <strong>${contractNo} (#${contract.id})</strong></div>
        </div>
        <div>
          <div style="font-weight:700;">STORAGE UNIT RENTAL AGREEMENT</div>
          <div style="margin-top:4px; font-style:italic;">Date of issue: ${createdDateStr}</div>
        </div>
      </div>

      <h1 class="contract-title">STORAGE UNIT RENTAL CONTRACT</h1>
      <div style="text-align:center; font-style:italic; margin-bottom:14px;">
        Contract <strong>#${contract.id}</strong> · Reservation <strong>#${contract.reservationId || contract.id}</strong>
      </div>

      <div class="party-box">
        <div class="party-title">I. LESSOR (PARTY A — SAFESPACE STORAGE)</div>
        <div class="party-grid">
          <div class="full">Company: <strong>SAFESPACE STORAGE VIETNAM CO., LTD</strong> (Tax ID: <strong>0318689999</strong>)</div>
          <div>Facility: <strong>${contract.facilityName || 'SafeSpace Facility'}</strong></div>
          <div>Representative: <strong>SafeSpace Operations Directorate</strong></div>
          <div class="full">Bank Account: <strong>0901000001 – MB Bank – Account Name: SAFESPACE STORAGE</strong></div>
        </div>
      </div>

      <div class="party-box">
        <div class="party-title">II. LESSEE (PARTY B — CUSTOMER)</div>
        <div class="party-grid">
          <div>Customer Name: <strong>${contract.customerName || user?.fullname || 'Customer'}</strong></div>
          <div>Customer ID: <strong>#${contract.customerId || user?.id || '1'}</strong></div>
          <div>Email: <strong>${user?.email || 'Verified SafeSpace Account'}</strong></div>
          <div>Authorized Signer: <strong>${signer}</strong></div>
        </div>
      </div>

      <div class="clause-title">CLAUSE 1: ASSIGNED STORAGE UNIT & RENTAL PERIOD</div>
      <div class="clause-body">
        <table class="contract-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Facility</th>
              <th>Unit Type</th>
              <th>Assigned Unit</th>
              <th>Rental Period</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>#${contract.id}</strong></td>
              <td>${contract.facilityName || 'SafeSpace Facility'}</td>
              <td>${contract.unitTypeName || 'Standard'}</td>
              <td><strong>Unit ${contract.unitCode || contract.storageUnitId}</strong></td>
              <td><strong>${startDateStr}</strong> → <strong>${endDateStr}</strong></td>
              <td><strong>${statusStr}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="clause-title">CLAUSE 2: RENTAL FEES, SECURITY DEPOSIT & TWO-STAGE PAYMENT SCHEDULE</div>
      <div class="clause-body">
        <table class="contract-table">
          <thead>
            <tr>
              <th>Payment Stage</th>
              <th>Calculation</th>
              <th>Amount (VND)</th>
              <th>Terms</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Stage 1: Security deposit</strong></td>
              <td>Unit hold & security deposit</td>
              <td><strong>${depositStr}</strong></td>
              <td>Payable within 24 hours of booking. Refunded upon contract completion and unit return inspection.</td>
            </tr>
            <tr>
              <td><strong>Stage 2: Initial rental (${monthsCount} month${monthsCount > 1 ? 's' : ''})</strong></td>
              <td>${monthlyStr} / month × ${monthsCount} month${monthsCount > 1 ? 's' : ''}${discountDiff > 0 ? ` (Discount applied: -${money(discountDiff)})` : ''}</td>
              <td><strong>${totalRentStr}</strong></td>
              <td>Payable in full before or at check-in prior to key handover.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="clause-title">CLAUSE 3: DEPOSIT REFUND, RENEWAL & RETURN POLICY</div>
      <div class="clause-body">
        <ul>
          <li><strong>Cancellation more than 10 days before the pickup deadline:</strong> 100% of the paid deposit is refunded immediately.</li>
          <li><strong>Cancellation or check-in within the final 10 days before the 1-month deadline:</strong> A 20% holding fee applies; the remaining 80% (${depositStr}) is recorded as the refundable deposit.</li>
          <li><strong>Contract renewal:</strong> Party B may renew this contract for 1 to 12 months per addendum without paying a new deposit.</li>
          <li><strong>Unit return & deposit refund:</strong> Upon contract completion and a damage-free unit inspection (Unit Return), Party A refunds the deposit (${depositStr}). Any repair fees are deducted from the deposit first.</li>
        </ul>
      </div>

      ${renewalRowsHtml}

      <div class="signature-section">
        <div class="sig-col">
          <div>
            <div style="font-weight:700; text-transform:uppercase;">FOR PARTY A (SAFESPACE STORAGE)</div>
            <div style="font-size:10.5pt; font-style:italic; color:#475569;">(Digital Corporate Seal)</div>
          </div>
          <div style="margin:10px auto;">
            <svg width="185" height="110" viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="8" width="208" height="114" rx="10" fill="#fff5f5" stroke="#dc2626" stroke-width="3" stroke-dasharray="6,3"/>
              <rect x="12" y="14" width="196" height="102" rx="7" fill="none" stroke="#dc2626" stroke-width="1.5"/>
              <text x="110" y="38" text-anchor="middle" fill="#dc2626" font-family="Arial, sans-serif" font-size="11" font-weight="bold">DIGITALLY SIGNED BY</text>
              <text x="110" y="62" text-anchor="middle" fill="#b91c1c" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold">SAFESPACE STORAGE</text>
              <text x="110" y="82" text-anchor="middle" fill="#b91c1c" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold">VIETNAM CO., LTD</text>
              <text x="110" y="104" text-anchor="middle" fill="#15803d" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold">✓ Verified · Tax ID: 0318689999</text>
            </svg>
          </div>
          <div>
            <div style="font-weight:700;">SafeSpace Operations Directorate</div>
            <div style="font-size:10.5pt; color:#15803d; font-weight:600;">Digitally signed upon issuance</div>
          </div>
        </div>

        <div class="sig-col">
          <div>
            <div style="font-weight:700; text-transform:uppercase;">FOR PARTY B (CUSTOMER)</div>
            <div style="font-size:10.5pt; font-style:italic; color:#475569;">(Customer Electronic Signature)</div>
          </div>
          <div style="margin:10px auto; min-height:110px; display:flex; align-items:center; justify-content:center;">
            ${
              sigUrl
                ? `<img id="customer-sig-img" class="sig-img" src="${sigUrl}" alt="Customer signature" />`
                : `<div style="color:#94a3b8; font-style:italic; font-size:11pt; padding:18px 10px; border:1px dashed #cbd5e1; border-radius:6px;">
                    (Awaiting customer electronic signature prior to check-in)
                   </div>`
            }
          </div>
          <div>
            <div style="font-weight:700;">${signer}</div>
            ${
              sigUrl
                ? `<div style="font-size:10.5pt; color:#15803d; font-weight:600;">✓ Signed on ${signedTime}</div>`
                : `<div style="font-size:10.5pt; color:#b45309; font-weight:600;">Status: Waiting for signature</div>`
            }
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const shouldPrint = ${autoPrint ? 'true' : 'false'};
      if (!shouldPrint) return;
      const img = document.getElementById('customer-sig-img');
      const triggerPrint = () => { setTimeout(() => { window.focus(); window.print(); }, 250); };
      if (img && !img.complete) {
        img.addEventListener('load', triggerPrint, { once: true });
        img.addEventListener('error', triggerPrint, { once: true });
      } else {
        window.addEventListener('load', triggerPrint, { once: true });
      }
    })();
  </script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    window.print()
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

import { assetUrl, api } from '../api/client.js'
import { fmtDate, fmtDateTime, money } from './format.js'
import { buildContractBody, CONTRACT_EXTRA_CSS } from './contractBody.js'

export const CONTRACT_STATUS_VI = {
  PENDING: 'Chờ nhận kho',
  ACTIVE: 'Đang thuê',
  OVERDUE: 'Quá hạn thanh toán',
  COMPLETED: 'Đã thanh lý & Hoàn cọc',
  CANCELLED: 'Đã hủy',
}

/** Nhãn trạng thái hợp đồng cho khách: hợp đồng chưa được quản lý duyệt hồ sơ thì hiện "Chờ duyệt hợp đồng". */
export function contractStatusText(c) {
  if (c?.status === 'PENDING' && c.profileStatus !== 'APPROVED') return 'Chờ duyệt hợp đồng'
  return CONTRACT_STATUS_VI[c?.status] || c?.status
}

export function maskContractCode(c) {
  const n = Number(c?.id || 1)
  const hash = ((n * 6971 + 203459) % 899999) + 100000
  return `HĐ-${hash}`
}

export function officialContractNumber(c) {
  const code = maskContractCode(c).replace('HĐ-', '')
  const year = c?.createdAt ? new Date(c.createdAt).getFullYear() : new Date().getFullYear()
  return `${code}/${year}/HĐTK-SAFESPACE`
}

export function parseRenewalMonths(payment, monthlyPrice) {
  const ref = payment?.transactionReference || ''
  if (ref.startsWith('RENEW_MONTHS:')) {
    const num = parseInt(ref.replace('RENEW_MONTHS:', '').trim(), 10)
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
 * Mở Hợp đồng Thuê Kho Điện Tử chuẩn khổ giấy A4 sang một Trang/Tab mới độc lập,
 * kèm theo Phụ lục gia hạn hợp đồng (nếu có) và tự động bật hộp thoại Xuất PDF / In sau khi ảnh chữ ký đã tải xong 100%.
 */
export function openContractInNewPage(
  contract,
  user,
  { autoPrint = false, fallbackSignatureUrl = '', fallbackSignerName = '', renewals = [], profile = null, blank = false, targetWindow = null, returnHtml = false, hideToolbar = false } = {}
) {
  if (!contract && !blank) return
  contract = contract || {}

  const sigUrl = contract.signatureUrl ? assetUrl(contract.signatureUrl) : fallbackSignatureUrl
  const signer = contract.signerName || fallbackSignerName || contract.customerName || user?.fullname || 'Khách hàng thuê kho'
  const signedTime = contract.signedAt ? fmtDateTime(contract.signedAt) : (sigUrl ? fmtDateTime(new Date().toISOString()) : '')
  const contractNo = officialContractNumber(contract)
  const shortCode = maskContractCode(contract)
  const createdDateStr = fmtDate(contract.createdAt || contract.startDate)
  const startDateStr = fmtDate(contract.startDate)
  const endDateStr = fmtDate(contract.endDate)
  const monthlyStr = money(contract.monthlyPrice)
  const depositStr = money(contract.depositAmount)
  const statusStr = contractStatusText(contract)

  let monthsCount = 1
  if (contract.startDate && contract.endDate) {
    const s = new Date(contract.startDate)
    const e = new Date(contract.endDate)
    const diffDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
    monthsCount = Math.max(1, Math.round(diffDays / 30))
  }
  const totalRentStr = money(Number(contract.monthlyPrice || 0) * monthsCount)

  const orderedRenewals = sortRenewalsAscending(renewals)
  const renewalRowsHtml = orderedRenewals.length > 0
    ? `
      <div class="clause-title" style="color:#1d4ed8; margin-top:20px;">
        PHỤ LỤC GIA HẠN HỢP ĐỒNG THUÊ KHO ĐIỆN TỬ (CONTRACT ADDENDUM)
      </div>
      <div class="clause-body">
        <p>Các bên thống nhất lập Phụ lục gia hạn thời hạn thuê kho đối với Hợp đồng số <strong>${contractNo}</strong> (giữ nguyên ô kho <strong>${contract.unitCode || contract.storageUnitId}</strong> và tiền đặt cọc bảo đảm hợp đồng), chi tiết các đợt gia hạn như sau:</p>
        <table class="contract-table">
          <thead>
            <tr>
              <th>Số Phụ Lục</th>
              <th>Số Tháng Gia Hạn Thêm</th>
              <th>Phí Gia Hạn</th>
              <th>Trạng Thái Thanh Toán</th>
              <th>Thời Gian Ghi Nhận</th>
              <th>Hạn Hợp Đồng Sau Gia Hạn</th>
            </tr>
          </thead>
          <tbody>
            ${orderedRenewals
              .map((r, idx) => {
                const mCount = parseRenewalMonths(r, contract.monthlyPrice)
                const stText = r.status === 'PAID' ? 'Đã thanh toán (Có hiệu lực)' : r.status === 'PENDING' ? 'Chờ thanh toán' : r.status
                const plNum = String(idx + 1).padStart(2, '0')
                return `
                  <tr>
                    <td><strong>Phụ lục #${idx + 1} (PL-${plNum}/${shortCode})</strong></td>
                    <td><strong>+${mCount} tháng</strong></td>
                    <td><strong>${money(r.amount)}</strong></td>
                    <td>${stText}</td>
                    <td>${fmtDateTime(r.paidAt || r.createdAt)}</td>
                    <td>Đến hết ngày <strong>${endDateStr}</strong></td>
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
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hợp Đồng Thuê Kho ${shortCode} - SafeSpace Storage</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 16mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 28px 16px 60px;
      background: #e2e8f0;
      font-family: "Times New Roman", Times, Georgia, serif;
      color: #0f172a;
      font-size: 13.5pt;
      line-height: 1.65;
    }
    .toolbar {
      max-width: 210mm;
      margin: 0 auto 18px;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.2);
    }
    .toolbar-title {
      font-size: 15px;
      font-weight: 600;
    }
    .toolbar-actions {
      display: flex;
      gap: 10px;
    }
    .btn-print {
      background: #f9b800;
      color: #0f172a;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    .btn-close {
      background: #334155;
      color: #ffffff;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
    }
    .a4-sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 18mm 20mm;
      box-shadow: 0 12px 36px rgba(15, 23, 42, 0.18);
      border: 1px solid #cbd5e1;
      position: relative;
    }
    .doc-border {
      border: 2px double #1e293b;
      padding: 22px 26px;
      min-height: 255mm;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 44% 56%;
      border-bottom: 1.5px solid #1e293b;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .org-col {
      text-align: center;
      font-size: 11.5pt;
      line-height: 1.45;
    }
    .org-name {
      font-weight: 700;
      text-transform: uppercase;
      color: #0f172a;
    }
    .motto-col {
      text-align: center;
      font-size: 12pt;
      line-height: 1.45;
    }
    .country-name {
      font-weight: 700;
      text-transform: uppercase;
    }
    .motto {
      font-weight: 700;
      display: inline-block;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 3px;
      margin-top: 2px;
    }
    .contract-title-block {
      text-align: center;
      margin: 18px 0 20px;
    }
    .contract-title {
      font-size: 18pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 6px;
      color: #0f172a;
    }
    .contract-subtitle {
      font-size: 12pt;
      font-style: italic;
      color: #334155;
    }
    .legal-basis {
      font-style: italic;
      font-size: 12.5pt;
      margin-bottom: 16px;
      text-align: justify;
    }
    .legal-basis p {
      margin: 4px 0;
    }
    .party-box {
      margin-bottom: 16px;
      padding: 12px 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
    }
    .party-title {
      font-weight: 700;
      font-size: 13pt;
      text-transform: uppercase;
      color: #0f172a;
      margin-bottom: 6px;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 4px;
    }
    .party-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
      font-size: 12.5pt;
    }
    .party-grid .full {
      grid-column: span 2;
    }
    .clause-title {
      font-weight: 700;
      font-size: 13pt;
      text-transform: uppercase;
      margin: 16px 0 6px;
      color: #0f172a;
    }
    .clause-body {
      text-align: justify;
      font-size: 12.5pt;
    }
    .clause-body p, .clause-body li {
      margin: 5px 0;
    }
    .clause-body ul {
      margin: 6px 0;
      padding-left: 22px;
    }
    table.contract-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 14px;
      font-size: 12pt;
    }
    table.contract-table th, table.contract-table td {
      border: 1px solid #334155;
      padding: 8px 10px;
      text-align: left;
    }
    table.contract-table th {
      background: #f1f5f9;
      font-weight: 700;
    }
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 26px;
      padding-top: 18px;
      border-top: 1.5px solid #334155;
      page-break-inside: avoid;
    }
    .sig-col {
      text-align: center;
      padding: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fcfcfd;
      min-height: 230px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sig-role {
      font-weight: 700;
      font-size: 13pt;
      text-transform: uppercase;
    }
    .sig-Instruction {
      font-size: 11pt;
      font-style: italic;
      color: #475569;
      margin-top: 2px;
    }
    .sig-image-wrap {
      margin: 10px auto;
      min-height: 115px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sig-img {
      max-height: 115px;
      max-width: 260px;
      object-fit: contain;
      display: block;
    }
    .sig-name {
      font-weight: 700;
      font-size: 13pt;
      color: #0f172a;
      margin-top: 6px;
    }
    .sig-meta {
      font-size: 11pt;
      color: #15803d;
      font-weight: 600;
      margin-top: 2px;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .toolbar {
        display: none !important;
      }
      .a4-sheet {
        width: 100%;
        min-height: auto;
        margin: 0;
        padding: 0;
        border: none;
        box-shadow: none;
      }
    }
${CONTRACT_EXTRA_CSS}
${hideToolbar ? '    .toolbar { display: none !important; } body { padding: 0 !important; background: #fff !important; } .a4-sheet { width: 100% !important; max-width: none !important; margin: 0 !important; min-height: 0 !important; }' : ''}
  </style>
</head>
<body>
${buildContractBody({
    contract,
    profile,
    blank,
    contractNo,
    shortCode,
    sigUrl,
    signer,
    signedTime,
    signedAtCounter: !!contract.signedAtCounter,
    monthsCount,
    renewalRowsHtml,
  })}

  <script>
    (function() {
      const shouldPrint = ${autoPrint ? 'true' : 'false'};
      if (!shouldPrint) return;
      const img = document.getElementById('customer-sig-img');
      const triggerPrint = () => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 250);
      };
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

  if (returnHtml) return html

  const win = targetWindow || window.open('', '_blank')
  if (!win) {
    window.print()
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

/**
 * Mở hợp đồng kèm hồ sơ thông tin của khách và phụ lục gia hạn (tự tải từ máy chủ).
 * Mở cửa sổ ngay khi bấm để trình duyệt không chặn, rồi điền nội dung khi tải xong.
 */
export async function openContract(contract, user, opts = {}) {
  const win = window.open('', '_blank')
  if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Đang tải hợp đồng...</p>')
  let profile = opts.profile || null
  let renewals = opts.renewals || []
  try {
    if (!profile && contract?.reservationId) {
      profile = await api.contractProfiles.get(contract.reservationId).catch(() => null)
    }
    if (!opts.renewals && contract?.id) {
      const list = await api.payments.forContract(contract.id).catch(() => [])
      renewals = sortRenewalsAscending((list || []).filter((p) => p.paymentType === 'RENEWAL'))
    }
  } catch { /* vẫn mở hợp đồng với dữ liệu hiện có */ }
  openContractInNewPage(contract, user, { ...opts, profile, renewals, targetWindow: win })
}

/** Mở bản mẫu hợp đồng trống để khách đọc trước hoặc để nhân viên in ra cho khách ký tay tại quầy. */
export function openBlankContract(user) {
  openContractInNewPage({}, user, { blank: true })
}

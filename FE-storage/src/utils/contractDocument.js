import { assetUrl } from '../api/client.js'
import { fmtDate, fmtDateTime, money } from './format.js'

export const CONTRACT_STATUS_VI = {
  PENDING: 'Chờ nhận kho (Chờ kích hoạt)',
  ACTIVE: 'Đang thuê (Đang hiệu lực)',
  OVERDUE: 'Quá hạn thanh toán',
  COMPLETED: 'Đã thanh lý & Hoàn cọc',
  CANCELLED: 'Đã hủy',
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

/**
 * Mở Hợp đồng Thuê Kho Điện Tử chuẩn khổ giấy A4 sang một Trang/Tab mới độc lập,
 * kèm theo Phụ lục gia hạn hợp đồng (nếu có) và tự động bật hộp thoại Xuất PDF / In sau khi ảnh chữ ký đã tải xong 100%.
 */
export function openContractInNewPage(
  contract,
  user,
  { autoPrint = false, fallbackSignatureUrl = '', fallbackSignerName = '', renewals = [] } = {}
) {
  if (!contract) return

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
  const statusStr = CONTRACT_STATUS_VI[contract.status] || contract.status

  let monthsCount = 1
  if (contract.startDate && contract.endDate) {
    const s = new Date(contract.startDate)
    const e = new Date(contract.endDate)
    const diffDays = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
    monthsCount = Math.max(1, Math.round(diffDays / 30))
  }
  const totalRentStr = money(Number(contract.monthlyPrice || 0) * monthsCount)

  const renewalRowsHtml = (renewals || []).length > 0
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
            ${renewals
              .map((r, idx) => {
                const mCount = parseRenewalMonths(r, contract.monthlyPrice)
                const stText = r.status === 'PAID' ? 'Đã thanh toán (Có hiệu lực)' : r.status === 'PENDING' ? 'Chờ thanh toán' : r.status
                return `
                  <tr>
                    <td><strong>Phụ lục #${idx + 1} (${shortCode}-PL0${idx + 1})</strong></td>
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
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-title">Hợp Đồng Thuê Kho Điện Tử · ${contractNo}</div>
    <div class="toolbar-actions">
      <button class="btn-print" onclick="window.print()">🖨️ Xuất PDF / In Hợp Đồng</button>
      <button class="btn-close" onclick="window.close()">Đóng tab</button>
    </div>
  </div>

  <div class="a4-sheet">
    <div class="doc-border">
      <div class="header-grid">
        <div class="org-col">
          <div class="org-name">CÔNG TY TNHH HỆ THỐNG KHO VẬN<br/>SAFESPACE VIỆT NAM</div>
          <div style="margin-top:4px;">Số: <strong>${contractNo}</strong></div>
        </div>
        <div class="motto-col">
          <div class="country-name">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="motto">Độc lập – Tự do – Hạnh phúc</div>
          <div style="margin-top:6px; font-style:italic; font-size:11.5pt;">
            TP. Hồ Chí Minh, ngày lập: ${createdDateStr}
          </div>
        </div>
      </div>

      <div class="contract-title-block">
        <h1 class="contract-title">HỢP ĐỒNG CHO THUÊ KHO LƯU TRỮ HÀNG HÓA</h1>
        <div class="contract-subtitle">
          (Mã hợp đồng điện tử: <strong>${shortCode}</strong> · Mã đơn đặt chỗ: <strong>#${contract.reservationId || contract.id}</strong>)
        </div>
      </div>

      <div class="legal-basis">
        <p>– Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015 của Quốc hội nước Cộng hòa Xã hội Chủ nghĩa Việt Nam;</p>
        <p>– Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005 và Luật Giao dịch điện tử số 20/2023/QH15;</p>
        <p>– Căn cứ nhu cầu thuê kho lưu trữ của Khách hàng và năng lực cung ứng hạ tầng kho bãi của Công ty SafeSpace.</p>
        <p>Hôm nay, ngày <strong>${createdDateStr}</strong>, chúng tôi gồm các bên dưới đây thống nhất giao kết Hợp đồng cho thuê kho lưu trữ với các điều khoản như sau:</p>
      </div>

      <div class="party-box">
        <div class="party-title">I. BÊN CHO THUÊ KHO (GỌI TẮT LÀ BÊN A)</div>
        <div class="party-grid">
          <div class="full">Tên pháp nhân: <strong>CÔNG TY TNHH HỆ THỐNG KHO VẬN SAFESPACE VIỆT NAM</strong></div>
          <div>Mã số doanh nghiệp: <strong>0318689999</strong></div>
          <div>Cơ sở quản lý kho: <strong>${contract.facilityName || 'Hệ thống kho SafeSpace'}</strong></div>
          <div>Đại diện pháp lý: <strong>Ban Giám Đốc Vận Hành SafeSpace</strong></div>
          <div>Chức vụ: <strong>Giám đốc Khối Vận hành Kho vận</strong></div>
          <div class="full">Tài khoản thụ hưởng: <strong>0901000001 – Ngân hàng TMCP Quân Đội (MB Bank) – Chủ TK: SAFESPACE STORAGE</strong></div>
        </div>
      </div>

      <div class="party-box">
        <div class="party-title">II. BÊN THUÊ KHO (GỌI TẮT LÀ BÊN B – KHÁCH HÀNG)</div>
        <div class="party-grid">
          <div>Họ và tên người thuê: <strong>${contract.customerName || user?.fullname || 'Khách hàng'}</strong></div>
          <div>Mã khách hàng định danh: <strong>KH-${contract.customerId || user?.id || '01'}</strong></div>
          <div>Email đăng ký tài khoản: <strong>${user?.email || 'Đã xác thực trên hệ thống SafeSpace'}</strong></div>
          <div>Người đại diện ký kết: <strong>${signer}</strong></div>
        </div>
      </div>

      <div class="clause-title">ĐIỀU 1: ĐỐI TƯỢNG HỢP ĐỒNG & QUY CÁCH Ô KHO BÀN GIAO</div>
      <div class="clause-body">
        <p>1.1. Bên A đồng ý cho Bên B thuê và Bên B đồng ý thuê không gian ô kho lưu trữ độc lập tại cơ sở của Bên A với thông số kỹ thuật và thời hạn cụ thể như sau:</p>
        <table class="contract-table">
          <thead>
            <tr>
              <th>Mã Hợp Đồng</th>
              <th>Cơ Sở Kho Lưu Trữ</th>
              <th>Hạng / Loại Kho</th>
              <th>Mã Ô Kho Bàn Giao</th>
              <th>Thời Hạn Thuê Kho</th>
              <th>Trạng Thái Hiện Tại</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${shortCode}</strong></td>
              <td>${contract.facilityName || 'SafeSpace Facility'}</td>
              <td>${contract.unitTypeName || 'Tiêu chuẩn'}</td>
              <td><strong>Ô kho ${contract.unitCode || contract.storageUnitId}</strong></td>
              <td>Từ <strong>${startDateStr}</strong> đến <strong>${endDateStr}</strong> (${monthsCount} tháng)</td>
              <td><strong>${statusStr}</strong></td>
            </tr>
          </tbody>
        </table>
        <p>1.2. Mục đích thuê: Lưu trữ tài sản, hàng hóa, vật dụng hợp pháp theo quy định của pháp luật Việt Nam và nội quy an toàn phòng cháy chữa cháy của hệ thống kho SafeSpace.</p>
      </div>

      <div class="clause-title">ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG, TIỀN ĐẶT CỌC & LỘ TRÌNH THANH TOÁN 2 ĐỢT</div>
      <div class="clause-body">
        <p>2.1. Chi phí thuê kho và khoản tiền đặt cọc bảo đảm thực hiện hợp đồng được hai bên thống nhất như sau:</p>
        <table class="contract-table">
          <thead>
            <tr>
              <th>Hạng Mục Thanh Toán</th>
              <th>Đơn Giá / Cách Tính</th>
              <th>Thành Tiền (VNĐ)</th>
              <th>Thời Điểm & Điều Kiện Thanh Toán</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Đợt 1: Tiền đặt cọc giữ kho</strong></td>
              <td>Bảo đảm hợp đồng & giữ ô kho</td>
              <td><strong>${depositStr}</strong></td>
              <td>Thanh toán trong vòng 24 giờ kể từ khi đặt chỗ (Hoàn trả khi thanh lý HĐ).</td>
            </tr>
            <tr>
              <td><strong>Đợt 2: Tiền thuê kho (${monthsCount} tháng)</strong></td>
              <td>${monthlyStr} / tháng × ${monthsCount} tháng</td>
              <td><strong>${totalRentStr}</strong></td>
              <td>Thanh toán đủ 100% trước hoặc tại thời điểm Check-in nhận bàn giao chìa khóa.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="clause-title">ĐIỀU 3: CHÍNH SÁCH GIỮ CHỖ, KHẤU TRỪ VÀ HOÀN TRẢ TIỀN ĐẶT CỌC</div>
      <div class="clause-body">
        <ul>
          <li><strong>Hủy đặt chỗ trước hạn nhận kho trên 10 ngày:</strong> Bên A hoàn trả ngay lập tức <strong>100% tiền đặt cọc</strong> cho Bên B.</li>
          <li><strong>Hủy đặt chỗ hoặc nhận bàn giao kho trong vòng 10 ngày cuối trước hạn chót (01 tháng):</strong> Khấu trừ 20% phí giữ kho; giá trị tiền cọc còn lại được ghi nhận hoàn trả cuối kỳ là <strong>${depositStr}</strong>.</li>
          <li><strong>Quá hạn 01 tháng không đến nhận kho:</strong> Đơn đặt chỗ tự động hủy và Bên B mất 100% tiền đặt cọc Đợt 1.</li>
          <li><strong>Hoàn trả tiền đặt cọc khi kết thúc hợp đồng:</strong> Khi hết hạn thuê kho và Bên B bàn giao lại ô kho nguyên trạng (qua biên bản kiểm tra trả kho <em>Unit Return</em> không hư hại), Bên A hoàn trả đầy đủ số tiền cọc <strong>${depositStr}</strong> cho Bên B. Trường hợp ô kho có hư hại vật lý, chi phí sửa chữa thực tế sẽ được khấu trừ trực tiếp vào tiền cọc.</li>
        </ul>
      </div>

      <div class="clause-title">ĐIỀU 4: GIA HẠN HỢP ĐỒNG, QUÁ HẠN & BÀN GIAO TRẢ KHO</div>
      <div class="clause-body">
        <ul>
          <li><strong>Gia hạn hợp đồng (Phụ lục gia hạn):</strong> Trước hoặc khi hết hạn hợp đồng, Bên B có quyền gửi yêu cầu gia hạn từ <strong>01 đến 12 tháng</strong> mỗi lần trên hệ thống. Mỗi lần gia hạn được ghi nhận thành Phụ lục gia hạn điện tử trực tiếp trên hợp đồng này (giữ nguyên ô kho và tiền cọc ban đầu), và ngày kết thúc hợp đồng tự động cộng nối tiếp ngay khi thanh toán phí gia hạn.</li>
          <li><strong>Quá hạn hợp đồng:</strong> Nếu quá ngày <strong>${endDateStr}</strong> mà Bên B chưa gia hạn hoặc chưa làm thủ tục trả kho, hợp đồng chuyển sang trạng thái <strong>Quá hạn (OVERDUE)</strong> và phát sinh phí quá hạn theo biểu phí niêm yết của cơ sở.</li>
        </ul>
      </div>

      ${renewalRowsHtml}

      <div class="clause-title">ĐIỀU 5: QUYỀN VÀ NGHĨA VỤ CỦA HAI BÊN & HIỆU LỰC HỢP ĐỒNG</div>
      <div class="clause-body">
        <ul>
          <li><strong>Trách nhiệm của Bên A:</strong> Đảm bảo ô kho khô ráo, an toàn kết cấu, hệ thống camera giám sát và PCCC hoạt động 24/7; bàn giao chìa khóa riêng cho Bên B khi hoàn tất thủ tục Check-in.</li>
          <li><strong>Trách nhiệm của Bên B:</strong> Tuyệt đối không lưu trữ hàng quốc cấm, vũ khí, hóa chất độc hại, chất dễ cháy nổ, động thực vật sống hoặc hàng hóa không rõ nguồn gốc; bảo quản chìa khóa kho và dọn dẹp tài sản khi kết thúc hợp đồng.</li>
          <li><strong>Hiệu lực pháp lý:</strong> Hợp đồng điện tử này có giá trị pháp lý tương đương hợp đồng văn bản giấy kể từ thời điểm Bên B ký tên điện tử xác nhận và hoàn tất nghĩa vụ thanh toán theo quy định.</li>
        </ul>
      </div>

      <div class="signature-section">
        <div class="sig-col">
          <div>
            <div class="sig-role">ĐẠI DIỆN BÊN A (BÊN CHO THUÊ)</div>
            <div class="sig-Instruction">(Ký số & Đóng dấu pháp nhân SafeSpace)</div>
          </div>
          <div class="sig-image-wrap">
            <svg width="190" height="115" viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="8" width="208" height="114" rx="10" fill="#fff5f5" stroke="#dc2626" stroke-width="3" stroke-dasharray="6,3"/>
              <rect x="12" y="14" width="196" height="102" rx="7" fill="none" stroke="#dc2626" stroke-width="1.5"/>
              <text x="110" y="38" text-anchor="middle" fill="#dc2626" font-family="Arial, sans-serif" font-size="11" font-weight="bold">ĐÃ KÝ SỐ &amp; ĐÓNG DẤU BỞI</text>
              <text x="110" y="60" text-anchor="middle" fill="#b91c1c" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold">CÔNG TY TNHH HỆ THỐNG</text>
              <text x="110" y="79" text-anchor="middle" fill="#b91c1c" font-family="Arial, sans-serif" font-size="13.5" font-weight="bold">KHO VẬN SAFESPACE</text>
              <text x="110" y="102" text-anchor="middle" fill="#15803d" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold">✓ Xác thực hợp lệ · MST: 0318689999</text>
            </svg>
          </div>
          <div>
            <div class="sig-name">Ban Giám Đốc Vận Hành SafeSpace</div>
            <div class="sig-meta">Đã ký số tự động khi phát hành hợp đồng</div>
          </div>
        </div>

        <div class="sig-col">
          <div>
            <div class="sig-role">ĐẠI DIỆN BÊN B (KHÁCH HÀNG THUÊ KHO)</div>
            <div class="sig-Instruction">(Chữ ký điện tử xác nhận của Bên B)</div>
          </div>
          <div class="sig-image-wrap">
            ${
              sigUrl
                ? `<img id="customer-sig-img" class="sig-img" src="${sigUrl}" alt="Chữ ký điện tử khách hàng" />`
                : `<div style="color:#94a3b8; font-style:italic; font-size:12pt; padding: 24px 10px; border: 1px dashed #cbd5e1; border-radius:6px; width: 100%;">
                    (Chưa có chữ ký điện tử — Vui lòng ký tên xác nhận trên hệ thống trước khi nhận bàn giao kho)
                   </div>`
            }
          </div>
          <div>
            <div class="sig-name">${signer}</div>
            ${
              sigUrl
                ? `<div class="sig-meta">✓ Đã ký điện tử lúc: ${signedTime}</div>`
                : `<div style="font-size:11pt; color:#b45309; font-weight:600;">Trạng thái: Chờ khách hàng ký tên</div>`
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

  const win = window.open('', '_blank')
  if (!win) {
    window.print()
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

import { fmtDate } from './format.js'
import { unitTypeLabel } from './format.js'
import SIGNATURE_A from '../assets/signature-benA.png?inline'

// Thông tin Bên A (công ty cho thuê kho). DỮ LIỆU DEMO: thay bằng thông tin pháp nhân thật khi triển khai.
export const COMPANY = {
  name: 'CÔNG TY TNHH SAFESPACE STORAGE',
  taxCode: '0318 689 999',
  address: '25 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  phone: '1900 636 868',
  email: 'hotro@safespace.vn',
  representative: 'Sông Mỹ Anh',
  position: 'Giám đốc',
  bankAccount: '107872356041',
  bankName: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank) - Chi nhánh TP. Hồ Chí Minh',
  bankHolder: 'CONG TY TNHH SAFESPACE STORAGE',
}

const DOTS = '<span class="dots">&nbsp;</span>'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const val = (v, blank) => (blank || v === undefined || v === null || v === '' ? DOTS : `<strong>${esc(v)}</strong>`)
const vnd = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')} đồng`

/**
 * Sinh phần thân của hợp đồng cho thuê kho (hợp đồng pháp lý đầy đủ).
 * blank = true: bản mẫu để đọc trước / in ra cho khách điền và ký tay tại quầy (mọi trường để trống).
 */
export function buildContractBody({
  contract = {},
  profile = null,
  blank = false,
  contractNo = '',
  shortCode = '',
  sigUrl = '',
  signer = '',
  signedTime = '',
  signedAtCounter = false,
  monthsCount = 1,
  renewalRowsHtml = '',
}) {
  const c = blank ? {} : contract
  const p = blank ? {} : profile || {}
  const today = fmtDate(new Date().toISOString())
  const created = blank ? null : fmtDate(c.createdAt || c.startDate)
  const monthly = c.monthlyPrice
  const deposit = c.depositAmount
  const rentTotal = monthly ? Number(monthly) * monthsCount : null

  const partyB = `
    <div class="party-grid">
      <div class="full">Họ và tên: ${val(p.fullName || (blank ? '' : c.customerName), blank)}</div>
      <div>Ngày sinh: ${val(p.dateOfBirth ? fmtDate(p.dateOfBirth) : '', blank)}</div>
      <div>Giới tính: ${val(p.gender, blank)} &nbsp; Quốc tịch: ${val(p.nationality, blank)}</div>
      <div>Số CCCD/CMND: ${val(p.nationalId, blank)}</div>
      <div>Ngày cấp: ${val(p.idIssueDate ? fmtDate(p.idIssueDate) : '', blank)}</div>
      <div class="full">Nơi cấp: ${val(p.idIssuePlace, blank)}</div>
      <div class="full">Địa chỉ thường trú: ${val(p.permanentAddress, blank)}</div>
      <div class="full">Địa chỉ liên hệ: ${val(p.contactAddress, blank)}</div>
      <div>Điện thoại: ${val(p.phone, blank)}</div>
      <div>Email: ${val(p.email, blank)}</div>
      <div>Nghề nghiệp: ${val(p.occupation, blank)}</div>
      <div>Người liên hệ khẩn cấp: ${val(p.emergencyName ? `${p.emergencyName} - ${p.emergencyPhone}` : '', blank)}</div>
    </div>`

  const unitTable = `
    <table class="contract-table">
      <tbody>
        <tr><th style="width:34%">Cơ sở kho</th><td>${val(c.facilityName, blank)}</td></tr>
        <tr><th>Loại kho</th><td>${val(unitTypeLabel(c.unitTypeName), blank)}</td></tr>
        <tr><th>Mã ô kho bàn giao</th><td>${val(c.unitCode, blank)}</td></tr>
        <tr><th>Thời hạn thuê</th><td>${blank || !c.startDate ? `Từ ngày ${DOTS} đến ngày ${DOTS} (${DOTS} tháng)` : `Từ <strong>${fmtDate(c.startDate)}</strong> đến hết ngày <strong>${fmtDate(c.endDate)}</strong> (<strong>${monthsCount}</strong> tháng)`}</td></tr>
        <tr><th>Giá thuê</th><td>${blank || !monthly ? `${DOTS} đồng/tháng` : `<strong>${vnd(monthly)}</strong>/tháng`}</td></tr>
      </tbody>
    </table>`

  const payTable = `
    <table class="contract-table">
      <thead><tr><th>Khoản thanh toán</th><th>Số tiền</th><th>Thời điểm thanh toán</th></tr></thead>
      <tbody>
        <tr><td><strong>Đợt 1 - Tiền đặt cọc</strong><br/>mặc định bằng 50% tổng tiền thuê (hoặc tỉ lệ khác do Bên A quy định)</td><td>${blank || !deposit ? `${DOTS} đồng` : `<strong>${vnd(deposit)}</strong>`}</td><td>Trong vòng 24 giờ kể từ khi đặt kho</td></tr>
        <tr><td><strong>Đợt 2 - Tiền thuê kho</strong><br/>toàn bộ tiền thuê theo số tháng đã đặt</td><td>${blank || !rentTotal ? `${DOTS} đồng` : `<strong>${vnd(rentTotal)}</strong>`}</td><td>Trong vòng nửa thời gian thuê kể từ ngày bắt đầu thuê. Trễ hạn Bên B chịu phí trễ theo ngày; trễ quá thời hạn cho phép, Bên A có quyền hủy hợp đồng và thu hồi ô kho</td></tr>
      </tbody>
    </table>`

  const refundTable = `
    <table class="contract-table">
      <thead><tr><th>Thời gian kho đã được giữ (tính từ ngày đóng cọc Đợt 1)</th><th>Mức hoàn tiền đặt cọc khi Bên B hủy</th></tr></thead>
      <tbody>
        <tr><td>Từ 01 đến 09 ngày</td><td>Hoàn <strong>100%</strong> tiền đặt cọc</td></tr>
        <tr><td>Từ 10 đến 19 ngày</td><td>Khấu trừ phí giữ kho theo số ngày đã giữ (mỗi ngày bằng 1/30 tiền đặt cọc), hoàn phần còn lại</td></tr>
        <tr><td>Từ 20 đến 29 ngày</td><td>Mất <strong>75%</strong>, hoàn <strong>25%</strong> tiền đặt cọc</td></tr>
        <tr><td>Từ 30 ngày trở đi</td><td>Mất <strong>100%</strong> tiền đặt cọc</td></tr>
      </tbody>
    </table>`

  const signBoxB = blank
    ? `<div class="sig-blank">(Ký và ghi rõ họ tên)</div>`
    : sigUrl
      ? `<img id="customer-sig-img" class="sig-img" src="${sigUrl}" alt="Chữ ký của Bên B" />`
      : `<div class="sig-blank">&nbsp;</div>`

  return `
  <div class="toolbar">
    <div class="toolbar-title">${blank ? 'Bản mẫu Hợp đồng thuê kho (để đọc trước / in ký tay)' : `Hợp đồng thuê kho · ${esc(contractNo)}`}</div>
    <div class="toolbar-actions">
      <button class="btn-print" onclick="window.print()">In / Xuất PDF</button>
      <button class="btn-close" onclick="window.close()">Đóng</button>
    </div>
  </div>

  <div class="a4-sheet">
    <div class="doc-border">
      <div class="header-grid">
        <div class="org-col">
          <div class="org-name">${COMPANY.name}</div>
          <div style="margin-top:4px;">Số: ${blank ? DOTS : `<strong>${esc(contractNo)}</strong>`}</div>
        </div>
        <div class="motto-col">
          <div class="country-name">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="motto">Độc lập - Tự do - Hạnh phúc</div>
        </div>
      </div>

      <div class="contract-title-block">
        <h1 class="contract-title">HỢP ĐỒNG THUÊ KHO LƯU TRỮ HÀNG HÓA</h1>
        <div class="contract-subtitle">${blank ? 'BẢN MẪU - chưa có giá trị pháp lý cho tới khi hai bên điền đủ thông tin và ký tên' : `Mã hợp đồng: ${esc(shortCode)} · Mã đơn đặt kho: #${esc(c.reservationId || '')}`}</div>
      </div>

      <div class="legal-basis">
        <p>- Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;</p>
        <p>- Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/6/2005;</p>
        <p>- Căn cứ Luật Giao dịch điện tử số 20/2023/QH15 ngày 22/6/2023;</p>
        <p>- Căn cứ Nghị định số 13/2023/NĐ-CP ngày 17/4/2023 của Chính phủ về bảo vệ dữ liệu cá nhân;</p>
        <p>- Căn cứ nhu cầu và khả năng của hai bên.</p>
        <p>Hôm nay, ngày ${blank ? `${DOTS} tháng ${DOTS} năm ${DOTS}` : `<strong>${esc(created || today)}</strong>`}, tại ${COMPANY.address}, hai bên gồm:</p>
      </div>

      <div class="party-box">
        <div class="party-title">BÊN CHO THUÊ (gọi tắt là Bên A)</div>
        <div class="party-grid">
          <div class="full">Tên đơn vị: <strong>${COMPANY.name}</strong></div>
          <div>Mã số thuế: <strong>${COMPANY.taxCode}</strong></div>
          <div>Điện thoại: <strong>${COMPANY.phone}</strong></div>
          <div class="full">Địa chỉ trụ sở: ${COMPANY.address}</div>
          <div>Đại diện: <strong>${COMPANY.representative}</strong></div>
          <div>Chức vụ: <strong>${COMPANY.position}</strong></div>
          <div class="full">Tài khoản nhận thanh toán: <strong>${COMPANY.bankAccount}</strong> - ${COMPANY.bankName} - Chủ tài khoản: ${COMPANY.bankHolder}</div>
        </div>
      </div>

      <div class="party-box">
        <div class="party-title">BÊN THUÊ (gọi tắt là Bên B)</div>
        ${partyB}
      </div>

      <p class="clause-body">Hai bên thống nhất ký kết Hợp đồng với các điều khoản sau:</p>

      <div class="clause-title">Điều 1. Đối tượng hợp đồng</div>
      <div class="clause-body">
        <p>1.1. Bên A đồng ý cho Bên B thuê, Bên B đồng ý thuê một ô kho lưu trữ độc lập có thông tin như sau:</p>
        ${unitTable}
        <p>1.2. Ô kho cụ thể do Bên A phân bổ sau khi Bên B đã đóng tiền đặt cọc Đợt 1, trong số các ô còn trống thuộc loại kho Bên B đã đặt. Bên B không có quyền yêu cầu một ô kho cố định nếu không có thỏa thuận bằng văn bản.</p>
        <p>1.3. Bên A giao ô kho trong tình trạng sạch, khô ráo, khóa và chìa khóa hoạt động bình thường. Việc bàn giao được thực hiện trực tiếp tại cơ sở thông qua thủ tục Check-in có xác nhận của nhân viên Bên A.</p>
      </div>

      <div class="clause-title">Điều 2. Mục đích sử dụng và hàng hóa bị cấm</div>
      <div class="clause-body">
        <p>2.1. Bên B chỉ sử dụng ô kho để lưu trữ tài sản, hàng hóa hợp pháp thuộc quyền sở hữu hoặc quyền sử dụng của mình${p.goodsDescription && !blank ? `; hàng hóa dự kiến lưu kho theo khai báo: <strong>${esc(p.goodsDescription)}</strong>` : `, mô tả hàng hóa dự kiến: ${DOTS}`}.</p>
        <p>2.2. Nghiêm cấm lưu trữ: hàng hóa pháp luật cấm lưu thông, vũ khí, vật liệu nổ, chất cháy nổ, hóa chất độc hại, chất phóng xạ, ma túy và tiền chất, động vật hoặc thực vật sống, thực phẩm tươi sống dễ phân hủy, tài sản không rõ nguồn gốc, và mọi vật phẩm có thể gây nguy hiểm, ô nhiễm hoặc thu hút côn trùng, động vật gây hại.</p>
        <p>2.3. Bên B không được ở, ngủ, kinh doanh bán hàng, tổ chức hoạt động tụ tập trong ô kho, không được cho thuê lại hoặc chuyển nhượng quyền sử dụng ô kho cho bên thứ ba khi chưa có sự đồng ý bằng văn bản của Bên A.</p>
      </div>

      <div class="clause-title">Điều 3. Giá thuê và phương thức thanh toán</div>
      <div class="clause-body">
        <p>3.1. Bên B thanh toán cho Bên A theo hai đợt:</p>
        ${payTable}
        <p>3.2. Thời hạn thuê khi đặt kho là 01 hoặc 02 tháng. Muốn thuê thêm, Bên B thực hiện gia hạn theo Điều 5.</p>
        <p>3.3. Thanh toán bằng chuyển khoản vào tài khoản của Bên A kèm đúng nội dung chuyển khoản do hệ thống cung cấp, hoặc bằng tiền mặt tại quầy của cơ sở. Khoản thanh toán chuyển khoản được hệ thống ghi nhận tự động khi ngân hàng báo có; thanh toán tiền mặt do nhân viên Bên A xác nhận và có biên nhận.</p>
        <p>3.4. Mọi khoản thu đều có hóa đơn hoặc biên nhận chi tiết mà Bên B xem được trên hệ thống. Bên A không thu bất kỳ khoản nào không được ghi trong hợp đồng này hoặc phụ lục kèm theo.</p>
      </div>

      <div class="clause-title">Điều 4. Tiền đặt cọc, hủy đặt kho và hoàn cọc</div>
      <div class="clause-body">
        <p>4.1. Tiền đặt cọc dùng để giữ ô kho và bảo đảm Bên B thực hiện hợp đồng. Nếu Bên B không đóng cọc trong 24 giờ kể từ lúc đặt kho, đơn đặt kho tự động hủy. Việc đặt kho nhưng không thanh toán nhiều lần liên tiếp sẽ bị cảnh báo và có thể dẫn đến tạm khóa tài khoản theo quy định của Bên A.</p>
        <p>4.2. Nếu Bên B hủy sau khi đã đóng cọc nhưng chưa nhận kho, mức hoàn trả được tính theo thời gian kho đã được giữ:</p>
        ${refundTable}
        <p>4.3. Khi Bên B nhận kho, tiền đặt cọc được Bên A giữ đến hết hợp đồng. Khi kết thúc hợp đồng và trả kho đúng quy định, Bên A hoàn lại tiền đặt cọc sau khi trừ các khoản chưa thanh toán gồm phí quá hạn, phụ phí phát sinh và chi phí sửa chữa hư hại (nếu có).</p>
        <p>4.4. Khoản hoàn được Bên A chuyển khoản về đúng tài khoản Bên B đã dùng để đóng cọc, kèm hóa đơn nêu rõ cọc đã nộp, từng khoản khấu trừ và số tiền hoàn. Trường hợp các khoản phí vượt tiền cọc, phần chênh lệch được lập hóa đơn riêng để Bên B thanh toán.</p>
      </div>

      <div class="clause-title">Điều 5. Thời hạn, gia hạn và quá hạn</div>
      <div class="clause-body">
        <p>5.1. Hợp đồng có hiệu lực kể từ khi Bên B ký và Bên A xác nhận hồ sơ, và thời hạn thuê tính từ ngày nhận kho ghi tại Điều 1.</p>
        <p>5.2. Bên B có thể gia hạn mỗi lần tối đa 02 tháng bằng cách thanh toán phí gia hạn trên hệ thống; thời gian gia hạn được nối tiếp ngày kết thúc hiện tại và ghi thành phụ lục của hợp đồng này.</p>
        <p>5.3. Bên A gửi thông báo nhắc hạn đến Bên B khi còn <strong>10, 05, 03 và 01 ngày</strong> trước ngày hết hạn, nêu rõ ô kho và cơ sở. Nếu Bên B không gia hạn, hợp đồng kết thúc khi hết hạn và Bên B được hiểu là đồng ý hoàn trả kho.</p>
        <p>5.4. Quá ngày hết hạn mà Bên B chưa gia hạn và chưa dọn kho, Bên B phải trả phí lưu kho quá hạn tính theo từng ngày (bằng 1/30 giá thuê một tháng cho mỗi ngày), được trừ trực tiếp vào tiền đặt cọc; phần vượt quá tiền cọc Bên B thanh toán riêng. Bên A có quyền áp dụng các biện pháp theo Điều 9 nếu quá hạn kéo dài.</p>
      </div>

      <div class="clause-title">Điều 6. Nhận kho và trả kho</div>
      <div class="clause-body">
        <p>6.1. Bên B nhận kho đúng ngày giờ đã hẹn, mang theo giấy tờ tùy thân bản gốc. Khi nhận kho, hai bên kiểm tra hiện trạng ô kho và nhân viên Bên A bàn giao chìa khóa; từ thời điểm này hợp đồng chuyển sang trạng thái đang thuê.</p>
        <p>6.2. Nếu Bên B không đến nhận kho theo lịch hẹn, nhân viên Bên A chờ và báo quản lý; quản lý liên hệ Bên B để dời lịch hoặc hủy theo Điều 4.</p>
        <p>6.3. Khi kết thúc hợp đồng, Bên B dọn sạch tài sản, trả ô kho và chìa khóa trong tình trạng ban đầu (trừ hao mòn tự nhiên). Nhân viên Bên A lập biên bản kiểm tra khi trả kho. Tài sản còn lại sau thời hạn quá hạn kéo dài được xử lý theo Điều 9.</p>
      </div>

      <div class="clause-title">Điều 7. Quyền và nghĩa vụ của Bên A</div>
      <div class="clause-body">
        <ul>
          <li>Bàn giao ô kho đúng thỏa thuận; bảo đảm an ninh chung của cơ sở gồm bảo vệ, camera giám sát và hệ thống phòng cháy chữa cháy.</li>
          <li>Hỗ trợ Bên B kịp thời khi có yêu cầu hỗ trợ, sửa chữa; thông báo trước cho Bên B khi cần vào kiểm tra ô kho vì lý do an toàn, trừ trường hợp khẩn cấp.</li>
          <li>Được kiểm tra thông tin, giấy tờ của Bên B; từ chối hoặc yêu cầu Bên B ký lại nếu hồ sơ không đúng sự thật, không rõ ràng hoặc chữ ký không hợp lệ.</li>
          <li>Được thu phí đúng thỏa thuận, khấu trừ vào tiền cọc theo hợp đồng và hoàn cọc đúng hạn.</li>
        </ul>
      </div>

      <div class="clause-title">Điều 8. Quyền và nghĩa vụ của Bên B</div>
      <div class="clause-body">
        <ul>
          <li>Khai báo thông tin trung thực, đầy đủ và chịu trách nhiệm về tính chính xác của thông tin và giấy tờ đã cung cấp.</li>
          <li>Thanh toán đúng hạn; giữ gìn ô kho, chìa khóa; không tự ý thay khóa, khoan đục, thay đổi kết cấu.</li>
          <li>Tuân thủ nội quy cơ sở, danh mục hàng cấm và hướng dẫn an toàn của nhân viên Bên A.</li>
          <li>Tự chịu trách nhiệm bảo quản tài sản của mình và tự mua bảo hiểm nếu có nhu cầu. Bên A chỉ chịu trách nhiệm bồi thường khi có lỗi chủ quan của Bên A gây thiệt hại, trong phạm vi thiệt hại thực tế được chứng minh.</li>
          <li>Thông báo ngay cho Bên A khi mất chìa khóa, phát hiện sự cố hoặc có thay đổi thông tin liên hệ.</li>
        </ul>
      </div>

      <div class="clause-title">Điều 9. Hư hại, bồi thường và xử lý tài sản tồn đọng</div>
      <div class="clause-body">
        <p>9.1. Nếu khi trả kho phát hiện ô kho bị hư hại ngoài hao mòn tự nhiên, nhân viên ghi nhận hạng mục hư hại; quản lý cơ sở chốt chi phí sửa chữa thực tế sau khi sửa xong và lập hóa đơn phí hư hại gửi Bên B. Chi phí được trừ vào tiền đặt cọc trước; phần vượt cọc do Bên B thanh toán riêng.</p>
        <p>9.2. Bên A có quyền nhắc nhở, thông báo bằng văn bản và liên hệ Bên B khi tài sản còn lại trong kho sau khi hợp đồng hết hạn. Trường hợp Bên B không liên hệ, không dọn kho sau thời gian hợp lý đã được thông báo, Bên A được xử lý tài sản tồn đọng theo quy định của pháp luật, chi phí lưu giữ và xử lý do Bên B chịu.</p>
      </div>

      <div class="clause-title">Điều 10. Bảo vệ dữ liệu cá nhân</div>
      <div class="clause-body">
        <p>Bên B đồng ý để Bên A thu thập, lưu trữ và sử dụng thông tin cá nhân, giấy tờ tùy thân trong hồ sơ này cho mục đích lập, thực hiện, quản lý hợp đồng, thanh toán, hỗ trợ khách hàng và các nghĩa vụ theo pháp luật. Bên A bảo mật thông tin, chỉ cho phép nhân viên có thẩm quyền truy cập, không cung cấp cho bên thứ ba trừ khi có yêu cầu của cơ quan nhà nước có thẩm quyền hoặc được Bên B đồng ý, và thực hiện theo Nghị định 13/2023/NĐ-CP.</p>
      </div>

      <div class="clause-title">Điều 11. Chấm dứt hợp đồng và từ chối hồ sơ</div>
      <div class="clause-body">
        <p>11.1. Hợp đồng chấm dứt khi hết hạn mà không gia hạn, khi hai bên thỏa thuận chấm dứt, hoặc khi một bên đơn phương chấm dứt theo quy định.</p>
        <p>11.2. Bên A có quyền đơn phương chấm dứt hợp đồng và hủy đơn nếu Bên B khai báo sai sự thật, giả mạo giấy tờ hoặc chữ ký, lưu trữ hàng cấm, hoặc vi phạm nghiêm trọng nội quy; khi đó khoản tiền đặt cọc được xử lý theo Điều 4 và Điều 9.</p>
        <p>11.3. Nếu hồ sơ hoặc chữ ký của Bên B chưa đạt, Bên A thông báo lý do và Bên B chỉnh sửa, ký lại. Sau ba lần hồ sơ không đạt, Bên B phải ký trực tiếp tại quầy khi nhận kho với sự xác nhận của nhân viên.</p>
      </div>

      <div class="clause-title">Điều 12. Bất khả kháng</div>
      <div class="clause-body">
        <p>Mỗi bên không chịu trách nhiệm khi không thực hiện được nghĩa vụ do sự kiện bất khả kháng như thiên tai, hỏa hoạn không do lỗi của bên nào, dịch bệnh, chiến tranh, quyết định của cơ quan nhà nước. Bên gặp sự kiện bất khả kháng phải thông báo ngay cho bên kia và nỗ lực khắc phục hậu quả.</p>
      </div>

      <div class="clause-title">Điều 13. Giải quyết tranh chấp</div>
      <div class="clause-body">
        <p>Mọi tranh chấp phát sinh trước hết do hai bên thương lượng, hòa giải. Nếu không thỏa thuận được, tranh chấp được đưa ra Tòa án nhân dân có thẩm quyền tại nơi Bên A có trụ sở để giải quyết theo pháp luật Việt Nam.</p>
      </div>

      <div class="clause-title">Điều 14. Điều khoản chung</div>
      <div class="clause-body">
        <p>14.1. Hợp đồng gồm các điều khoản trên cùng các phụ lục gia hạn (nếu có) và hóa đơn, biên bản đính kèm; tất cả là một phần không tách rời của hợp đồng.</p>
        <p>14.2. Hợp đồng được lập dưới dạng hợp đồng điện tử và có thể được in thành bản giấy. Chữ ký điện tử của Bên B và xác nhận của Bên A trên hệ thống có giá trị pháp lý theo Luật Giao dịch điện tử. Trường hợp ký bản giấy, hợp đồng lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản.</p>
        <p>14.3. Bên B xác nhận đã đọc kỹ, hiểu rõ và đồng ý với toàn bộ nội dung hợp đồng, tự nguyện ký tên và cam kết thông tin khai báo là đúng sự thật.</p>
      </div>

      ${blank ? '' : renewalRowsHtml}

      ${!blank && c.signedBeforeAssign && c.unitCode ? `
      <div class="clause-title">PHỤ LỤC BÀN GIAO Ô KHO</div>
      <div class="clause-body">
        <p>Bên B đã ký hợp đồng này trước khi Bên A gán ô kho cụ thể. Theo Điều 1.2, sau khi Bên B đóng cọc, Bên A đã phân bổ ô kho như sau và Bên B đồng ý, không phải ký lại:</p>
        <table class="contract-table">
          <tr><th style="width:34%">Cơ sở kho</th><td><strong>${esc(c.facilityName || '')}</strong></td></tr>
          <tr><th>Loại kho</th><td><strong>${esc(unitTypeLabel(c.unitTypeName) || '')}</strong></td></tr>
          <tr><th>Mã ô kho bàn giao</th><td><strong>${esc(c.unitCode)}</strong></td></tr>
          ${c.unitFloor ? `<tr><th>Tầng</th><td><strong>${esc(c.unitFloor)}</strong></td></tr>` : ''}
          ${c.unitLocation ? `<tr><th>Vị trí</th><td><strong>${esc(c.unitLocation)}</strong></td></tr>` : ''}
          <tr><th>Ngày lập phụ lục</th><td><strong>${esc(fmtDate(c.createdAt || c.startDate))}</strong></td></tr>
        </table>
        <p>Nhân viên bàn giao và giờ nhận kho theo lịch hẹn nhận kho trên hệ thống.</p>
      </div>` : ''}

      <div class="signature-section">
        <div class="sig-col">
          <div>
            <div class="sig-role">ĐẠI DIỆN BÊN A</div>
            <div class="sig-Instruction">(Ký, ghi rõ họ tên, đóng dấu)</div>
          </div>
          <div class="sig-image-wrap">${blank ? '<div class="sig-blank">&nbsp;</div>' : `<img src="${SIGNATURE_A}" alt="Chữ ký đại diện Bên A" style="max-height:96px;max-width:100%;display:block;margin:0 auto" />`}</div>
          <div><div class="sig-name">${COMPANY.representative}</div><div class="sig-meta" style="color:#475569">${COMPANY.position}</div></div>
        </div>
        <div class="sig-col">
          <div>
            <div class="sig-role">ĐẠI DIỆN BÊN B</div>
            <div class="sig-Instruction">(Ký và ghi rõ họ tên)</div>
          </div>
          <div class="sig-image-wrap">${signBoxB}</div>
          <div>
            <div class="sig-name">${blank ? DOTS : esc(signer || p.fullName || '')}</div>
            ${!blank && sigUrl ? `<div class="sig-meta">Đã ký ${signedAtCounter ? 'trực tiếp tại quầy' : 'điện tử'} lúc ${esc(signedTime)}</div>` : ''}
          </div>
        </div>
      </div>


    </div>
  </div>
`
}

export const CONTRACT_EXTRA_CSS = `
    /* Trình bày như một văn bản hợp đồng thật: phẳng, không khung viền, không ô nền */
    .a4-sheet { border: 0 !important; box-shadow: none !important; padding: 18mm 22mm !important; }
    .doc-border { border: 0 !important; padding: 0 !important; min-height: 0 !important; }
    .header-grid { border-bottom: 0 !important; }
    .party-box { border: 0 !important; background: none !important; padding: 0 !important; margin-bottom: 12px !important; }
    .party-title { border-bottom: 0 !important; margin-bottom: 4px !important; }
    .sig-col { border: 0 !important; background: none !important; }
    .signature-section { border-top: 0 !important; }
    body { font-size: 13.5pt; }
    .dots { display:inline-block; min-width: 130px; border-bottom: 1px dotted #475569; }
    .sig-blank, .sig-empty { color:#94a3b8; font-style:italic; font-size:11.5pt; padding: 38px 8px; width:100%; text-align:center; }
    .legal-warning { margin-top: 14px; padding: 8px 0 0; border-top: 1px solid #b91c1c; color:#7f1d1d; font-size:11.5pt; }
`

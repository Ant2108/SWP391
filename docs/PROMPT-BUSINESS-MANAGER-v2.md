# Prompt v2 – Luồng Business Manager (đã chỉnh theo bản đang chạy của dự án)

> Bản này sửa lại prompt cũ cho khớp với code hiện tại. Phần "Điểm cần chốt" ở cuối cần hai bên đồng ý trước khi làm.

## 0. Quy ước chung (áp dụng cho MỌI mục bên dưới)

- **Mọi chữ hiển thị phải là tiếng Việt**: nhãn, nút, menu, thông báo lỗi, thông báo chuông, email, tiêu đề cột, trạng thái rỗng.
  Chỉ giữ tiền tố máy đọc ở đầu thông báo lỗi (ví dụ `PRICE_CHANGED:`), giao diện sẽ cắt tiền tố trước khi hiển thị (giống `STREAK_WARNING:` và `SLOT_FULL:` đang dùng).
- Dùng sẵn các hàm đã có, không viết lại:
  - Giao diện: `label()`, `unitTypeLabel()`, `money()`, `fmtDate()` trong `FE-storage/src/utils/format.js`; `useCancellationPolicy()` trong `components/CancellationPolicy.jsx` (trả về chính sách hiện hành).
  - Backend: `PolicyService.get()` trả về chính sách do Business Manager đặt.
- Ngày hiển thị theo giờ máy, định dạng `vi-VN`. Không dùng `toISOString()` để lấy ngày.
- Tiền hiển thị bằng `money()` (ví dụ `1.200.000 ₫`), không dùng `toLocaleString('en-US')`.
- Chạy test backend trên bản sao riêng, không chạy trực tiếp khi IntelliJ đang chạy backend.

### Những thứ đã có sẵn trong dự án (đừng làm lại)
- Trang **Chính sách** (`/admin/policies`, `pages/admin/Policies.jsx`) + API `GET/PUT /api/policies`: Business Manager đặt số tháng tối đa của đơn đặt kho, **số tháng tối đa mỗi lần gia hạn**, ngày nhận kho xa nhất, giờ giữ đơn chưa đóng cọc và các mốc hủy/hoàn cọc.
- **Tiền cọc** mặc định 50% tổng tiền thuê; Business Manager có thể đặt % khác bằng luật giá `DEPOSIT` loại `PERCENTAGE`. Luật cọc số tiền cố định bị bỏ qua và bị ẩn khỏi danh sách.
- Nút **Xóa** (có xác nhận) cho Cơ sở, Loại kho, Ô kho, Luật giá. API `DELETE /api/facilities|unit-types|storage-units|price-rules/{id}`.
- Bảng `Payment` có cột riêng `refundAmount`, `deductionAmount`, `deductionLines`. Chuỗi `transactionReference` của cọc có dạng `HOAN_COC:số|KHAU_TRU:số|NGAY_GIU:n` hoặc `MAT_COC:0.00|NGAY_GIU:n`.
- Nhiều file giao diện đã sửa nhiều (xem mục "Xung đột"). Làm trên bản hiện tại, không làm trên bản cũ.

---

## 1. Báo cáo kinh doanh cho Business Manager (backend tổng hợp)

**Backend (file mới)**
- `model/reponse/ReportSummaryResponse.java`: `from`, `to`, `facilityId`, `totals` (Row), `facilities` (List<FacilityRow{facilityId, facilityName, facilityStatus, Row data}>), `unitTypes` (List<UnitTypeRow{unitTypeName, totalUnits, occupiedUnits, reservedUnits, availableUnits, occupancyRate, totalRevenue}>).
  Row gồm: `totalUnits, availableUnits, reservedUnits, occupiedUnits, unavailableUnits` (INSPECTION + MAINTENANCE), `occupancyRate`, `pendingContracts, activeContracts, overdueContracts, completedContracts`, `rentalRevenue, feeRevenue, totalRevenue`, `depositsCollected, depositsRefunded`, **`depositsRetained`** (mới, xem bên dưới).
- `service/ReportService.java` (`@Transactional(readOnly = true)`, chỉ đọc):
  - Lọc payment theo `paidAt` trong [from, to] (tùy chọn) và theo `facilityId` (tùy chọn).
  - `rentalRevenue` = PAID `RENTAL` + `RENEWAL`; `feeRevenue` = PAID `OVERDUE_FEE` + `EXTRA_FEE` + `DAMAGE_FEE`; `totalRevenue` = rental + fee.
  - Tiền cọc **không** tính vào doanh thu: `depositsCollected` = DEPOSIT có trạng thái PAID hoặc REFUNDED.
  - **`depositsRefunded` = tổng cột `Payment.refundAmount`** của các DEPOSIT (KHÔNG parse chuỗi `transactionReference`).
  - **`depositsRetained`** (cọc công ty giữ lại do khách hủy muộn hoặc bị khấu trừ khi trả kho) = tổng `Payment.deductionAmount` của DEPOSIT + toàn bộ số tiền của DEPOSIT bị mất cọc (đơn đã hủy và không hoàn đồng nào). Khoản này là thu nhập thật của công ty; hiển thị thành một dòng riêng, không cộng vào `totalRevenue` để dễ đối chiếu.
  - Cơ sở/loại kho của một payment: lấy theo `rentalContract.storageUnit`, không có thì theo `reservation`.
  - `occupancyRate` (%) = (OCCUPIED + RESERVED) / tổng ô, 1 chữ số thập phân.
  - Theo loại kho: gộp theo tên loại kho trên mọi cơ sở.
  - `to < from` → `BadRequestException` với thông báo tiếng Việt ("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu").
- `controller/ReportController.java`: `GET /api/reports/summary?from=&to=&facilityId=` (`@DateTimeFormat(iso = ISO.DATE)`), `@PreAuthorize("hasAnyRole('BUSINESS_MANAGER','SYSTEM_ADMIN')")`.

**Frontend**
- `api/client.js`: `reports.summary(filters)` → `GET /reports/summary`.
- `pages/admin/Reports.jsx` (mới), tiêu đề **"Báo cáo"**:
  - Bộ lọc "Doanh thu từ ngày" / "Đến ngày" (mặc định ngày 1 tháng này → hôm nay, theo giờ máy), lọc cơ sở ("Tất cả cơ sở").
  - 4 thẻ: **Tổng doanh thu**, **Tỷ lệ sử dụng kho**, **Hợp đồng đang thuê**, **Tiền cọc đã thu / đã hoàn / đang giữ lại**.
  - Bảng **Theo cơ sở** (phân trang 25) và **Theo loại kho** (tên loại kho dùng `unitTypeLabel`).
  - Nút **"Xuất Excel (CSV)"**: tạo CSV trên trình duyệt, thêm BOM `﻿`, bọc ô có dấu phẩy hoặc ngoặc kép; hai phần (theo cơ sở + dòng TỔNG, theo loại kho); tên file `bao-cao-{from}_{to}.csv`; tiêu đề cột tiếng Việt.
- `layouts/AdminLayout.jsx`: menu `{ to: '/admin/reports', label: 'Báo cáo', icon: BarChart3, roles: ['BUSINESS_MANAGER','SYSTEM_ADMIN'] }`.
- `App.jsx`: `const REPORTS = ['BUSINESS_MANAGER','SYSTEM_ADMIN']` và route `reports`.
- `pages/admin/Dashboard.jsx`: Business Manager / System Admin thấy nút **"Xem báo cáo"** (→ `/admin/reports`) thay cho "Quản lý ô kho". Đồng thời đổi nhãn trạng thái ô kho trong biểu đồ thanh sang tiếng Việt bằng `label()` (hiện đang là Available, Reserved…).

---

## 2. Gia hạn khi giá đã thay đổi → bắt khách xác nhận

**Backend**
- `RenewalRequest`: thêm `Boolean confirmPriceChange`.
- `RenewalQuoteResponse` (record mới): `contractId, months, currentMonthlyRate, newMonthlyRate, totalAmount, priceChanged, changePercent`.
- `RentalContractService`:
  - `currentPaidMonthlyRate(contract)`: duyệt payment của hợp đồng (mới nhất trước), lấy RENEWAL đã PAID có `transactionReference` dạng `RENEW_MONTHS:n` → `amount / n`; không có thì dùng `contract.monthlyPrice`.
  - `renewalQuote(id, months)`: `authorizeView`; `months` mặc định 1; **hợp lệ khi 1 ≤ months ≤ `policyService.get().getMaxRenewalMonths()`** (KHÔNG để cứng 12), sai thì 400 với thông báo "Mỗi lần gia hạn chỉ được từ 1 đến N tháng."; `newRate = resolveRenewalMonthlyRate(contract)`; `priceChanged = newRate != currentRate`; `changePercent = (new - current) * 100 / current` (1 chữ số); `totalAmount = newRate * months`.
  - Trong `renew()`: nếu `currentRate != null`, giá mới khác giá hiện tại và `confirmPriceChange != true` → `ConflictException("PRICE_CHANGED:Giá gia hạn mỗi tháng đã đổi từ X sang Y. Vui lòng xác nhận giá mới để tiếp tục.")` (409).
- `RentalContractController`: `GET /api/rental-contracts/{id}/renewal-quote?months=N`, `@PreAuthorize("hasRole('CUSTOMER')")`.
- Cập nhật test `ReservationContractPaymentIntegrationTest.fullMember3BusinessFlow`: bước gia hạn 2 tháng (giá RENEWAL khác giá hợp đồng) → `renewal-quote` trả `priceChanged = true`; gia hạn không xác nhận → 409; có `"confirmPriceChange": true` → 200.

**Frontend**
- `api/client.js`: `rentalContracts.renewalQuote(id, months)`.
- `pages/account/Contracts.jsx` (làm trên bản hiện tại, ô chọn tháng đã lấy từ `useCancellationPolicy()`):
  - State `renewQuote` (lấy báo giá khi mở hộp gia hạn hoặc đổi số tháng) và `priceNotice`.
  - Số tiền ước tính dùng `renewQuote.totalAmount`.
  - `submitRenewal(confirmed = false)`: chưa xác nhận → gọi `renewalQuote`; nếu `priceChanged` thì mở hộp thoại hỏi giá và dừng. Gọi `renew` với `confirmPriceChange: confirmed`. Bắt lỗi chứa `PRICE_CHANGED` thì lấy lại báo giá và mở hộp thoại.
  - Hộp thoại chặn màn hình (`role="alertdialog"`, không đóng bằng Esc hoặc bấm ngoài): **"Giá gia hạn đã thay đổi"**, bảng "Giá bạn đang trả / Giá gia hạn mới (kèm nhãn % đỏ khi tăng, xanh khi giảm) / Tổng phí gia hạn N tháng", câu "Hợp đồng hiện tại vẫn giữ nguyên giá đã ký…", hai nút **"Không gia hạn"** và **"Đồng ý giá mới và tiếp tục"**. Không dùng emoji.

---

## 3. Thông báo khi Business Manager đổi giá (cho từng vai trò)

- `UsersRepository.findByRoleAndStatus(Role, Status)`; `RentalContractRepository.findByStatusIn(Collection<ContractStatus>)`.
- `PriceRuleService`: inject `OperationsNotificationService notifier` + `RentalContractRepository`; `@Slf4j`. Gọi `notifyPriceChange(rule, action)` sau khi **thêm mới ("đã được thêm mới"), cập nhật ("đã được cập nhật"), ngừng áp dụng ("đã ngừng áp dụng") và xóa ("đã bị xóa")**. Bọc try/catch, lỗi chỉ ghi log, không làm hỏng việc lưu giá.
  - Chỉ gửi khi **giá trị, ngày hiệu lực hoặc trạng thái thật sự đổi** (tránh gửi lặp khi bấm lưu mà không đổi gì).
  - Nội dung: "{Loại giá} ({cơ sở | toàn hệ thống}, loại kho X) {hành động}: {giá trị}, hiệu lực từ … đến …". Nhãn: RENTAL Giá thuê, DEPOSIT Tiền cọc (theo %), RENEWAL Giá gia hạn, OVERDUE Phí quá hạn, EXTRA_FEE Phụ phí, DAMAGE_FEE Phí hư hại, DISCOUNT Giảm giá. Giá trị: "x%" hoặc "1.200.000 ₫/tháng" hoặc "/ngày".
  - Người nhận nội bộ (link `/admin/price-rules`, tiêu đề "Bảng giá vừa thay đổi", kèm "Người thực hiện"): mọi System Admin + Business Manager đang hoạt động; Facility Manager + Facility Staff của cơ sở bị đổi (giá toàn hệ thống → mọi Facility Manager/Staff); bỏ chính người vừa sửa; không gửi trùng.
  - Khách (link `/account/contracts`, tiêu đề "Bảng giá dịch vụ thay đổi"): chỉ với RENTAL, RENEWAL, OVERDUE; khách có hợp đồng PENDING/ACTIVE/OVERDUE đúng cơ sở (và đúng loại kho nếu luật có loại kho); mỗi khách một lần. Câu: "Hợp đồng hiện tại của bạn giữ nguyên giá đã ký; giá mới chỉ áp dụng cho lần gia hạn tiếp theo và bạn sẽ được hỏi xác nhận trước khi gia hạn." (OVERDUE: "Mức phí mới chỉ áp dụng nếu hợp đồng của bạn bị quá hạn.")
  - Dùng `notifier.notifyUser(user, subject, heading, message, path)`. Lưu ý: link khách là `/account/contracts` (không phải `/account/rentals`, trang này đã chuyển hướng).

---

## 4. Giá tháng trên hợp đồng = giá đã chốt trong đơn

- `service/ContractPricing.java` (mới): `static lockedMonthlyPrice(Reservation r, BigDecimal fallback)`: nếu `r.estimatedAmount` và `r.rentalMonths > 0` thì `estimatedAmount / rentalMonths` (2 chữ số, HALF_UP), không thì dùng `fallback`.
- Dùng đủ **3 chỗ tạo hợp đồng**: `PaymentService.applyPaidSideEffects` (cọc), `ReservationService` (tạo hợp đồng PENDING khi đã cọc), `RentalContractService.createFromReservation`. (Đã kiểm tra: đúng 3 chỗ này đang gọi `setMonthlyPrice` với giá niêm yết.)
- **Cần chốt trước khi làm**: xem điểm 4 ở phần "Điểm cần chốt".

---

## 5. Bộ lọc trang Bảng giá (Price Rules)

**Backend**: `PriceRuleResponse` thêm `String facilityName`, `String unitTypeName`; `PriceRuleService.toResponse` điền hai trường này.

**Frontend** `pages/admin/PriceRules.jsx` (lọc trên trình duyệt, làm trên bản hiện tại đã có nút Xóa, nhãn tiếng Việt, ẩn luật cọc cố định):
- `EMPTY_FILTERS = { q, facility, unitType, priceType, status }`; khung bộ lọc (grid `auto-fit minmax(180px, 1fr)`):
  - **Tìm kiếm** (theo tên cơ sở, loại kho, loại giá, số tiền).
  - **Cơ sở**: "Tất cả cơ sở" / "Toàn hệ thống" / từng cơ sở (đổi cơ sở thì reset loại kho).
  - **Loại kho**: theo cơ sở đang lọc, lấy từ `unitTypeName` (hiển thị qua `unitTypeLabel`); "Mọi loại kho" = luật áp cả cơ sở; vô hiệu khi chọn "Toàn hệ thống".
  - **Loại giá** (nhãn tiếng Việt, không có luật cọc cố định).
  - **Trạng thái**: "Tất cả" / "Đang áp dụng hôm nay" (active và hôm nay nằm trong khoảng hiệu lực, theo giờ máy) / "Đang bật" / "Đã vô hiệu hóa".
- Dòng "Hiển thị x / y luật" + nút **"Xóa bộ lọc"**; không có kết quả → trạng thái rỗng **"Không có luật giá phù hợp"**.
- Cột **Phạm vi**: hiện `facilityName` và "Loại kho: {unitTypeLabel(unitTypeName)}" hoặc "Mọi loại kho" (thay cho "Áp dụng cho một loại kho cụ thể").

---

## 6. (Đề xuất, đề cần chốt) Miễn phí cho khách: "fee-waiver"

Đề ghi Business Manager quản lý chính sách "giảm giá hoặc miễn phí" (discount or fee-waiver). Hiện mới có giảm giá khi đặt kho, **chưa có miễn phí**.
- Thêm thao tác **"Miễn khoản phí"** cho khoản PENDING loại `OVERDUE_FEE`, `EXTRA_FEE`, `DAMAGE_FEE`: Business Manager hoặc Facility Manager nhập **lý do** (bắt buộc), khoản đó chuyển sang trạng thái đã miễn (dùng trạng thái hiện có như `FAILED` + ghi lý do vào `deductionLines`, tránh thêm giá trị enum mới vì SQL Server có check constraint).
- Khoản đã miễn **không tính vào doanh thu**; ghi vào thông báo cho khách ("Khoản phí … đã được miễn").
- Hiển thị trong báo cáo (mục 1) thành một dòng "Phí đã miễn".

---

## Điểm khó khăn, xung đột và cần sửa

### A. Xung đột cần hai bên đồng ý
1. **Tiếng Việt toàn bộ.** Prompt cũ có nhiều chuỗi tiếng Anh (Reports, View reports, Search, All, Clear filters, "x of y rules", "No matching price rules", "Unit type: …", thông báo `PRICE_CHANGED…`). Bản v2 đã đổi hết; mọi mục mới phải theo quy ước này. *(Đã thống nhất.)*
2. **Hợp nhất code.** Dự án chỉ có một bản đang chạy, không có bản cũ. `Contracts.jsx` và `PriceRules.jsx` đã sửa nhiều (popup hồ sơ, bảng hóa đơn, nút Xóa, luật cọc theo %…). Mọi mục trên phải làm **trực tiếp trên bản hiện tại**, không viết lại cả file. *(Đã thống nhất.)*
3. **Số tháng gia hạn.** Báo giá và kiểm tra gia hạn phải dùng `maxRenewalMonths` trong trang Chính sách, không dùng 1..12. *(Đã thống nhất.)*

### B. Chỗ prompt cũ sai so với code hiện tại (đã sửa trong v2)
4. `depositsRefunded` không được parse chuỗi `transactionReference` vì định dạng khác; phải đọc cột `refundAmount`.
5. Thiếu phần **cọc công ty giữ lại** (khách hủy muộn, khấu trừ khi trả kho) → thêm `depositsRetained`.
6. Thông báo cho khách phải gắn link `/account/contracts` vì `/account/rentals` đã chuyển hướng.
7. Thông báo đổi giá phải gửi cả khi **xóa** luật giá (đã có nút Xóa), và chỉ gửi khi dữ liệu thật sự đổi, tránh spam email.
8. Luật cọc số tiền cố định đã bị bỏ qua; bảng giá và thông báo không được nhắc chúng.

### C. Điểm cần chốt (hai bên cùng quyết định)
- **Điểm 4: giá chốt khi có giảm giá.** `estimatedAmount` đã trừ giảm giá, nên giá tháng của hợp đồng sẽ là giá đã giảm. Khi không có luật gia hạn, `resolveRenewalMonthlyRate` lấy giá hợp đồng, tức là khách được giá giảm vĩnh viễn khi gia hạn. Hai lựa chọn:
  - *(a)* Giữ như prompt: giá hợp đồng = giá đã giảm, gia hạn cũng giá đó (đơn giản, nhưng khuyến mãi kéo dài mãi).
  - *(b)* Giá hợp đồng = giá niêm yết, giảm giá chỉ áp dụng cho đơn đầu (đúng với hiểu "khuyến mãi", nhưng phí quá hạn/gia hạn tính theo giá niêm yết).
  - Đề xuất: **(b)**. Cần quyết định trước khi viết `ContractPricing`.
- **Mục 6 (miễn phí)**: có làm không? Nếu có, dùng cách ghi trạng thái như đã mô tả.
- **Gửi email hàng loạt khi đổi giá**: chỉ gửi chuông trong ứng dụng hay gửi cả email? Đề xuất: chuông cho tất cả, email chỉ cho khách có hợp đồng bị ảnh hưởng.

### D. Việc kiểm tra bắt buộc sau khi làm
- Chạy toàn bộ test backend trên bản sao riêng (hiện 99 test), cập nhật test gia hạn theo mục 2.
- `npm run build` ở `FE-storage`.
- Đăng nhập thử bằng ba vai trò: Business Manager (xem báo cáo, đổi giá), Facility Manager (đổi giá thuê cơ sở mình, nhận chuông), Khách (nhận thông báo, bị hỏi xác nhận khi gia hạn).
- Tự quét chữ tiếng Anh còn sót trước khi giao.

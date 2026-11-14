# Rà soát phần TV3 (Đặt chỗ – Hợp đồng – Thanh toán): lỗi logic, luồng, dữ liệu

Nguồn: đọc code backend (`ReservationService`, `PaymentService`, `RentalContractService`), giao diện (`ReservationManagement.jsx`, `account/Reservations.jsx`, `account/Contracts.jsx`, `Checkout.jsx`), file phân công nhóm, và các ảnh chụp màn hình bạn gửi.
Mức độ: **CAO** = sai nghiệp vụ / sai tiền / sai trạng thái, **TB** = sai luồng hoặc thừa, **THẤP** = hiển thị / tiện dụng.
Mình chưa sửa gì trong code.

---

## 0. Đặc tả của nhóm nói gì về TV3 (để đối chiếu)

- TV3 chỉ cần: tạo đặt chỗ → manager xem / kiểm tra còn kho / **gán ô** / **xác nhận** / hủy → tạo hợp đồng từ đặt chỗ → **kích hoạt hợp đồng** → xem hợp đồng → hoàn tất hợp đồng → đánh dấu quá hạn → **gia hạn** → thanh toán (cọc, thuê, gia hạn, phí quá hạn, phí phát sinh, phí hư hại).
- Sơ đồ tích hợp: `Reservation → Assign unit → Payment (cọc) → [TV4] Appointment Check-in → Rental Contract ACTIVE → (Gia hạn: TV3 | Hỗ trợ: TV4) → [TV4] Trả kho`.
  Tức là **hợp đồng chuyển ACTIVE là do check-in của TV4**. Hiện TV3 có thêm đường thứ hai (nút "Kích hoạt HĐ"), nên bị trùng.
- Màn hình TV3 theo đặc tả: Form đặt kho, Đơn của tôi, Chi tiết đơn, Kho đang thuê, Chi tiết hợp đồng, Gia hạn, Trang thanh toán, Lịch sử thanh toán (khách) và Quản lý đơn, Gán ô, Quản lý hợp đồng, Trạng thái thanh toán, Danh sách quá hạn (manager).

---

## 1. Lỗi MỨC CAO (sai nghiệp vụ / tiền / trạng thái)

### 1.1 Đơn đã được gán ô nhưng chưa đóng cọc thì KHÔNG BAO GIỜ tự hủy sau 24h
- `ReservationService.expireUnpaidOver24hReservations` chỉ quét các đơn ở trạng thái **PENDING**.
- Nhưng khi manager bấm "Gán ô" hoặc "Xác nhận", đơn chuyển ngay sang **CONFIRMED** (kể cả khi chưa cọc).
- Hệ quả: đơn chưa cọc mà đã được gán ô thì không còn bị quét → ô kho bị giữ (RESERVED) mãi, khách không đóng cọc cũng không bị hủy. Đây là lỗi bạn mô tả ở cuối: "đơn sẽ bị hủy sau 24h chưa thanh toán mà".
- Cần: quét mọi đơn chưa có cọc PAID (PENDING và CONFIRMED) sau 24h kể từ lúc tạo.

### 1.2 Manager gán ô khi khách CHƯA đóng cọc, và hợp đồng được tạo ngay
- `assignUnit` / `confirm` gọi `ensurePendingContractIfDepositPaid`, nhưng hàm này **không kiểm tra cọc đã trả**: có ô là tạo hợp đồng PENDING.
- Hệ quả: tồn tại hợp đồng (ví dụ HĐ #1003 của đơn #1004) cho đơn chưa từng đóng cọc rồi bị hủy. Đơn #1004 trong ảnh: "Chờ đóng cọc" nhưng đã có hợp đồng.
- Cần: chỉ gán ô và tạo hợp đồng sau khi đã nhận cọc (hoặc chấp nhận gán sớm nhưng không tạo hợp đồng cho tới khi có cọc).

### 1.3 Nhãn "thanh toán" sai sau khi hoàn cọc hoặc hủy đơn; còn hiện nút đóng cọc lại
- `ReservationService.toResponse` tính `depositPaid` = "có khoản cọc đang PAID". Sau khi **hoàn cọc** (REFUNDED, lúc trả kho) hoặc **hủy** thì không còn PAID, nên:
  - Đơn "Đã bàn giao kho" (đơn #2, #5 trong ảnh) vẫn hiện **"Chưa thanh toán (Hạn 24 giờ)"** và badge **"Chờ đóng cọc"**.
  - Đơn đã hủy (#3, #6, #1004) ở trang manager cũng hiện "Chờ đóng cọc" (trong khi trang khách hiện "Đã hủy").
  - `account/Reservations.jsx` (dòng ~333) chỉ chặn nút thanh toán khi đơn CANCELLED, nên đơn **đã bàn giao / đã trả kho** vẫn có nút "Thanh toán Đợt 1" (đóng cọc lại).
- Đây chính là ảnh số 10: "Đã bàn giao kho" mà "Chưa thanh toán (Hạn 24h)".
- Cần: phân biệt 4 trạng thái của khoản cọc (chờ trả / đã trả / đã hoàn / hủy) và hiển thị đúng theo trạng thái đơn.

### 1.4 Đợt 2 (tiền thuê 100%) trả được bất cứ lúc nào, kể cả trước khi có ô kho
- `Reservations.jsx` cho thanh toán Đợt 2 ngay khi cọc xong, chỉ cần đơn chưa hủy. Đơn #1005 trong ảnh: "Đã đóng cọc + Đã đóng đủ (27.000.000đ)" nhưng trạng thái vẫn "Chờ duyệt & gán kho" (chưa có ô, chưa có hợp đồng, chưa có lịch).
- Trong khi chính màn hình và hợp đồng ghi "Đợt 2: thanh toán khi nhận kho / trước hoặc tại thời điểm check-in".
- Tiền Đợt 2 chưa gắn với hợp đồng nào (Đợt 2 chỉ được tạo cùng lúc cọc xong, còn hợp đồng thì chưa có).
- Cần quyết định: Đợt 2 chỉ được trả sau khi đã gán ô (và có hợp đồng), hay chỉ trả tại quầy khi check-in.

### 1.5 Hai đường "giao kho" cho cùng một việc (trùng giữa TV3 và TV4)
- TV3 có nút **"Kích hoạt HĐ"** (trang Quản lý hợp đồng, và lặp lại ở tab "Danh sách quá hạn") đưa hợp đồng sang ACTIVE, ô sang OCCUPIED, đơn sang COMPLETED.
- TV4 có **Check-in** làm đúng việc đó (kèm bàn giao chìa khóa).
- Theo bạn: "bàn giao = chỉ khi đã check-in". Hiện manager bấm "Kích hoạt HĐ" là kho đã "bàn giao" mà không có lịch hay chìa khóa. (Một phần đã được vá bằng việc tự đóng lịch nhận kho, nhưng đường trùng vẫn còn.)

### 1.6 Quy tắc hoàn cọc / phạt tính theo ngày tạo đơn + 1 tháng, không phải ngày nhận kho
- `calculateDepositRetentionRatio`: hạn chót = `ngày tạo đơn + 1 tháng` (hoặc ngày nhận kho nếu muộn hơn). Hủy trước hạn chót > 10 ngày thì hoàn 100%; trong 10 ngày cuối thì mất 20%; quá hạn thì mất 100%.
- Ví dụ: khách đặt ngày 1, hẹn nhận kho ngày 3 rồi hủy ngày 3 → vẫn được hoàn 100% (vì hạn chót là ngày 1 tháng sau). Khách không đến nhận kho cũng không mất gì cho tới khi hết 1 tháng.
- Không khớp với trực giác "hạn nhận kho = ngày nhận khách đã chọn".
- Và quy tắc 20% còn áp dụng khi khách **thanh toán Đợt 2** (rơi vào 10 ngày cuối thì cắt cọc của hợp đồng) – tức là phạt người đến nhận kho muộn, nhưng không phạt người không đến.

### 1.7 "Báo quá hạn" thủ công cho phép đánh dấu quá hạn một hợp đồng chưa hết hạn, và tạo phí phạt
- `markSingleOverdue` chỉ kiểm tra hợp đồng đang ACTIVE/OVERDUE, **không kiểm tra EndDate < hôm nay**, rồi tạo phí OVERDUE_FEE.
- Còn có thêm "quét hàng loạt" và job tự động 15 phút/lần (ba cách cho một việc). Job tự động đã đủ.
- Phí quá hạn chỉ được tạo **một lần** (số ngày quá hạn tính ở thời điểm tạo, thường là 1 ngày) và không tăng theo ngày. Khách gia hạn xong thì hợp đồng về ACTIVE nhưng khoản phí quá hạn cũ vẫn PENDING.
- Cả "cắt 20% cọc" cũng được tính ở hai chỗ khác nhau (lúc tạo hợp đồng theo ngày gán ô, và lúc trả Đợt 2 theo ngày trả), cùng dùng mốc "ngày tạo đơn + 1 tháng".

---

## 2. Lỗi luồng và trùng lặp (TB)

### 2.1 Hai API làm cùng một việc: "Gán ô" và "Xác nhận"
- Cả hai đều đặt đơn thành CONFIRMED, giữ ô RESERVED, sinh hợp đồng + thông báo. Trạng thái `ASSIGNED` có trong enum nhưng **không bao giờ được dùng**. `confirm` còn tự chọn ô đầu tiên còn trống nếu manager chưa chọn. Theo đặc tả: gán ô (ASSIGNED) rồi mới xác nhận (CONFIRMED).

### 2.2 Tab "Danh sách quá hạn" hiển thị TẤT CẢ hợp đồng (lỗi giao diện thật)
- Bộ đếm tab dùng `overdueCandidates` (đang 0), còn bảng ở tab lại render `allContracts` (toàn bộ). Ảnh số 9: tab ghi (0) nhưng liệt kê cả HĐ đã hủy, đã thanh lý, chờ nhận kho. Sai logic và còn trùng tab "Hợp đồng thuê kho".

### 2.3 Lọc thanh toán lẫn cả giao dịch của đơn đã hủy
- `PaymentService.list` đọc toàn bộ bảng Payments rồi lọc bằng Java (chậm khi dữ liệu lớn), không loại các khoản FAILED/REFUNDED của đơn đã hủy; bộ lọc chỉ có "trạng thái" và "loại khoản thu", không lọc theo ngày, theo hợp đồng hay theo đơn. Ảnh số 11: danh sách vẫn hiện giao dịch của đơn đã hủy (#1004, #1005 "Đã hủy").
- Không có "mặc định ẩn đơn đã hủy".

### 2.4 Đơn đã hủy hiện mãi
- Đơn / hợp đồng / lịch / khoản thanh toán của đơn đã hủy nằm vĩnh viễn trong danh sách khách và staff (ảnh số 10 có 4 đơn "Đã hủy").
- Bạn muốn: ẩn sau 24 giờ kể từ lúc hủy (chỉ ở trang staff và khách; manager / BM vẫn thấy). Hiện chưa có trường "thời điểm hủy" riêng (chỉ có `updatedAt`).

### 2.5 "Thanh toán online giả lập" cho khách tự đánh dấu PAID mọi khoản (kể cả gia hạn, phí quá hạn)
- Endpoint mới `simulate-gateway` cho khách tự chuyển PENDING → PAID cho **bất kỳ** khoản nào của mình (đặt cọc, thuê, gia hạn, phí quá hạn…), và áp dụng luôn hiệu ứng (kích hoạt gia hạn, v.v.).
- Đối chiếu comment "BR-42: chỉ nhân viên xác nhận PAID" trong cùng file: hai cơ chế mâu thuẫn. Khách tự trả phí quá hạn / phí hư hại (của TV4) = tự xóa nợ khi bấm.

### 2.6 Hoàn tiền không có dòng giao dịch riêng
- Hoàn cọc chỉ đổi trạng thái khoản cọc sang REFUNDED và ghi chữ vào `transactionReference` ("HOAN_COC_80%_TRU_20%_PHI:…"). Số tiền hoàn nằm trong chuỗi chữ, không phải số; không có bản ghi hoàn tiền. Hợp đồng cũng lưu một "cọc hoàn trả" khác (`depositAmount` = phần còn được hoàn), nên màn hình ghi 500.000đ ở "Tiền cọc" hoặc "Giá tháng / Tiền cọc" tùy chỗ.

### 2.7 Hợp đồng chưa ký / đơn hủy (đã xử lý một phần ở bước trước)
- Đã sửa trên giao diện khách (nút Ký bị khóa với đơn hủy; hợp đồng đã ký hoặc đã trả kho chỉ có "Xem HĐ & Phụ lục").

### 2.8 Giờ nhận kho
- Đơn chỉ có `StartDate` (ngày). Lịch nhận kho được tạo tự động ở **09:00**; khách không chọn giờ. Bạn muốn thêm giờ nhận 9h–17h.

---

## 3. Lỗi dữ liệu mẫu / hiển thị

- Số tiền mẫu "100₫ / 300₫" ở đơn #1, #2 và hợp đồng của khách test là dữ liệu mẫu cũ (seed của TV4 và DataInit). Không khớp giá bảng giá thật (cọc 900.000₫, thuê 1.000.000₫…). Nên dọn hoặc cập nhật seed.
- Một số đơn do dữ liệu mẫu cũ không tuân thủ luồng (ví dụ đơn đã bàn giao mà khoản cọc vẫn PENDING lúc tạo seed).
- Tiền cọc hiển thị: nhãn cố định "50% tổng tiền thuê" nhưng giá trị lấy theo luật giá cọc riêng (ví dụ XL: cọc 2.000.000₫ trong khi 50% = hơn 13 triệu).
- Nút "Đặt thuê kho mới" dẫn tới danh sách (`/storage-options`) thay vì thẳng form đặt (`/checkout`).
- Giao diện trộn tiếng Việt / tiếng Anh ("Reservations & contracts", "Appointments"…, "Đơn #1005"…).
- Trang hợp đồng của khách có 2 nút cho cùng một tài liệu ("Xem HĐ & Phụ lục" và "Mở trang HĐ").

---

## 4. Màn hình / quyền của staff

- Staff (và manager) cùng vào "Reservations & contracts" với 4 tab: Đơn đặt chỗ, Hợp đồng, Quá hạn, Giao dịch thanh toán. Staff không gán ô, không xác nhận, nhưng vẫn thấy toàn bộ đơn, hợp đồng và giao dịch của cơ sở.
- Theo bạn: "staff chỉ thấy phần mình quản". Hiện staff thấy cả những đơn chưa liên quan tới họ.

---

## 5. Giải thích hai câu hỏi về trang Appointments (phần TV4 – của bạn)

- **Ô "Type"**: loại lịch hẹn. `CHECK_IN` = khách đến **nhận kho** (nhận chìa khóa); `RETURN` = khách đến **trả kho**; `SUPPORT` = lịch hỗ trợ tại cơ sở. Ảnh số 7 chọn "CHECK IN" thấy như "hiện toàn bộ" vì trong dữ liệu hiện chỉ có lịch CHECK_IN (giao diện khách chỉ tạo được lịch nhận kho; trả kho staff ghi trực tiếp bằng "Record a unit return"), nên lọc không đổi gì.
- **"No-show"** (khách vắng): khi khách không đến theo giờ hẹn, staff bấm "Report no-show" ghi lý do (lịch vẫn "chờ"), manager nhận thông báo rồi quyết định: đổi lịch, hủy, hoặc đánh dấu `NO_SHOW`. Trong ô "Status" có `NO SHOW` cho trạng thái cuối đó; mục "No-show reports" trong ô "View" là danh sách lịch đã bị báo vắng nhưng manager chưa xử lý.
- Ô "Status" đang hiện tên thô (`SCHEDULED`, `COMPLETED`…) và có cả "CANCELLED" nên cũng sẽ đưa vào quy tắc "ẩn lịch hủy sau 24h" cho staff.

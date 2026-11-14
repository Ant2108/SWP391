// Thông tin tài khoản nhận tiền của công ty (DỮ LIỆU GIẢ LẬP phục vụ demo).
// Khi chạy thật chỉ cần đổi các giá trị này và cấu hình webhook của SePay/Casso trỏ tới /api/payments/bank-webhook.
// Đặt VITE_BANK_CODE / VITE_BANK_ACC / VITE_BANK_NAME trong FE-storage/.env để dùng số tài khoản thật đã liên kết SePay.
export const BANK = {
  code: import.meta.env.VITE_BANK_CODE || 'ICB',
  name: 'VietinBank (Ngân hàng TMCP Công Thương Việt Nam)',
  shortName: import.meta.env.VITE_BANK_SHORT || 'VietinBank',
  accountNumber: import.meta.env.VITE_BANK_ACC || '107872356041',
  accountName: import.meta.env.VITE_BANK_NAME || 'CONG TY TNHH SAFESPACE STORAGE',
  merchant: 'SafeSpace Storage',
  branch: 'Chi nhánh TP. Hồ Chí Minh',
}

// Ảnh mã VietQR chuẩn (quét bằng mọi app ngân hàng, tự điền sẵn số tiền + nội dung).
export function vietQrImage(payment) {
  const p = new URLSearchParams({
    acc: BANK.accountNumber,
    bank: BANK.code,
    amount: String(Math.round(Number(payment?.amount) || 0)),
    des: transferContentOf(payment),
    template: 'compact',
  })
  return `https://qr.sepay.vn/img?${p.toString()}`
}

// Mã nội dung chuyển khoản của một khoản thu: khớp với PaymentService.transferCode ở backend.
export const transferCodeOf = (payment) => payment?.transferCode || `SS${payment?.id}`

// VietinBank chỉ báo biến động số dư cho SePay khi nội dung chuyển khoản BẮT ĐẦU bằng "SEVQR".
// Backend tìm mã SS<số> ở bất kỳ vị trí nào trong nội dung nên vẫn khớp được khoản thu.
export const TRANSFER_PREFIX = import.meta.env.VITE_TRANSFER_PREFIX ?? 'SEVQR'
export const transferContentOf = (payment) => `${TRANSFER_PREFIX ? TRANSFER_PREFIX + ' ' : ''}${transferCodeOf(payment)}`

// Địa chỉ trang "ngân hàng giả" mà mã QR dẫn tới (điền sẵn mọi thông tin).
export function mockBankUrl(payment) {
  const p = new URLSearchParams({
    acc: BANK.accountNumber,
    name: BANK.accountName,
    amount: String(Math.round(Number(payment.amount) || 0)),
    content: transferCodeOf(payment),
  })
  return `${window.location.origin}/mock-bank?${p.toString()}`
}

// Bí mật webhook dùng cho demo (trùng app.payments.webhook-secret ở backend).
export const WEBHOOK_SECRET = import.meta.env.VITE_MOCK_BANK_SECRET || 'demo-secret'

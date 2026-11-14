import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Copy, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { api } from '../api/client.js'
import { BANK, mockBankUrl, transferCodeOf, transferContentOf, vietQrImage } from '../utils/bank.js'
import { money } from '../utils/format.js'

/**
 * Hộp thanh toán bằng mã VietQR.
 * Khách quét QR (hoặc chuyển khoản theo thông tin bên cạnh); khi ngân hàng báo có (SePay webhook), khoản thu tự động PAID.
 * Component tự hỏi lại trạng thái mỗi 3 giây và gọi onPaid() khi đã thanh toán.
 */
export default function BankQrPay({ payment, onPaid }) {
  const [copied, setCopied] = useState('')
  const [paid, setPaid] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (!payment?.id) return undefined
    doneRef.current = false
    setPaid(false)
    const timer = setInterval(async () => {
      try {
        const fresh = await api.payments.get(payment.id)
        if (fresh.status === 'PAID' && !doneRef.current) {
          doneRef.current = true
          setPaid(true)
          clearInterval(timer)
          onPaid?.(fresh)
        }
      } catch { /* mạng chập chờn: thử lại lần sau */ }
    }, 3000)
    return () => clearInterval(timer)
  }, [payment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!payment) return null
  const code = transferContentOf(payment)
  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* trình duyệt chặn clipboard */ }
  }
  const row = (label, value, copyText, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(148,163,184,.25)' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 17 : 14.5, textAlign: 'right' }}>
        {value}
        {copyText && (
          <button type="button" onClick={() => copy(label, copyText)} title="Sao chép" style={{ marginLeft: 8, background: 'none', border: 0, cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            {copied === label ? <CheckCircle2 size={15} color="#15803d" /> : <Copy size={15} />}
          </button>
        )}
      </span>
    </div>
  )

  return (
    <div style={{ border: '1px solid rgba(148,163,184,.4)', borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 10px 30px rgba(15,23,42,.08)', color: '#0f172a' }}>
      <div style={{ background: '#0f172a', color: '#fff', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12.5, opacity: .75 }}>Số tiền cần thanh toán</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: .3 }}>{money(payment.amount)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: .9 }}>
          <ShieldCheck size={16} /> Thanh toán an toàn qua VietQR
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, padding: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          {imgFailed ? (
            <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <QRCodeSVG value={mockBankUrl(payment)} size={230} />
            </div>
          ) : (
            <img
              src={vietQrImage(payment)}
              alt={`Mã VietQR thanh toán ${code}`}
              width={290}
              style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid #e2e8f0', display: 'block' }}
              onError={() => setImgFailed(true)}
            />
          )}
          <div style={{ marginTop: 10, fontSize: 13, color: '#475569', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={15} /> Mở app ngân hàng và quét mã
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Hoặc chuyển khoản thủ công</div>
          {row('Đơn vị thu', BANK.merchant)}
          {row('Ngân hàng', BANK.shortName)}
          {row('Số tài khoản', BANK.accountNumber, BANK.accountNumber, true)}
          {row('Chủ tài khoản', BANK.accountName)}
          {row('Số tiền', money(payment.amount), String(Math.round(Number(payment.amount))), true)}
          {row('Nội dung', code, code, true)}
          <div style={{ marginTop: 12, fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
            Vui lòng nhập <strong>đúng nội dung {code}</strong> để hệ thống tự đối soát.
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(148,163,184,.25)', background: paid ? '#f0fdf4' : '#f8fafc', textAlign: 'center', fontSize: 14 }}>
        {paid ? (
          <strong style={{ color: '#15803d' }}><CheckCircle2 size={17} style={{ verticalAlign: -3 }} /> Đã nhận được tiền, thanh toán thành công!</strong>
        ) : (
          <span style={{ color: '#475569' }}><Loader2 size={15} style={{ verticalAlign: -3, animation: 'spin 1s linear infinite' }} /> Đang chờ ngân hàng xác nhận. Trang sẽ tự cập nhật ngay khi nhận được tiền.</span>
        )}
      </div>
    </div>
  )
}

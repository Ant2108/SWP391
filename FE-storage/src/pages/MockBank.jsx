import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { BANK, WEBHOOK_SECRET } from '../utils/bank.js'
import { money } from '../utils/format.js'

const BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * Trang "ngân hàng giả" mô phỏng ứng dụng ngân hàng sau khi khách quét QR: mọi thông tin đã điền sẵn,
 * khách chỉ bấm Chuyển tiền. Trang gọi webhook giống hệt cách ngân hàng/SePay báo có thật,
 * nên khoản thu tự động chuyển PAID. Khi triển khai thật, trang này không còn dùng tới.
 */
export default function MockBank() {
  const [q] = useSearchParams()
  const amount = Number(q.get('amount') || 0)
  const content = q.get('content') || ''
  const [state, setState] = useState('idle') // idle | sending | ok | fail
  const [msg, setMsg] = useState('')

  const transfer = async () => {
    setState('sending')
    try {
      const res = await fetch(`${BASE}/payments/bank-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
        body: JSON.stringify({ content, amount, transactionId: `FT${Date.now()}` }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Chuyển khoản thất bại')
      setState('ok')
    } catch (e) {
      setMsg(e.message)
      setState('fail')
    }
  }

  const line = (k, v) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ color: '#64748b' }}>{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f2b5c', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', color: '#0f172a', borderRadius: 18, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: '#0f2b5c' }}>{BANK.shortName} iPay</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Ứng dụng ngân hàng giả lập (chỉ dùng để demo)</div>
        </div>
        {state === 'ok' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 size={56} color="#16a34a" />
            <h3 style={{ margin: '12px 0 4px' }}>Chuyển khoản thành công</h3>
            <p style={{ color: '#475569' }}>Đã chuyển {money(amount)} tới {BANK.accountName}. Quý khách có thể quay lại trang web, trạng thái sẽ tự cập nhật.</p>
          </div>
        ) : (
          <>
            {line('Người nhận', q.get('name') || BANK.accountName)}
            {line('Ngân hàng', BANK.shortName)}
            {line('Số tài khoản', q.get('acc') || BANK.accountNumber)}
            {line('Số tiền', money(amount))}
            {line('Nội dung', content)}
            {state === 'fail' && <p style={{ color: '#b91c1c', marginTop: 12 }}>{msg}</p>}
            <button
              type="button"
              onClick={transfer}
              disabled={state === 'sending' || !amount || !content}
              style={{ width: '100%', marginTop: 18, padding: '14px', border: 0, borderRadius: 12, background: '#0f2b5c', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}
            >
              <ShieldCheck size={18} style={{ verticalAlign: -3 }} /> {state === 'sending' ? 'Đang chuyển...' : 'Xác nhận chuyển tiền'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

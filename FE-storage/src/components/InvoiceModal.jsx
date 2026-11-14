import { Printer } from 'lucide-react'
import { Modal, Button, LoadingState, ErrorState } from './ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { fmtDateTime, money } from '../utils/format.js'

const STATUS_VI = { PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', REFUNDED: 'Đã hoàn cọc', FAILED: 'Đã hủy' }
const METHOD_VI = {
  BANK_TRANSFER: 'Chuyển khoản ngân hàng (QR)',
  CASH: 'Tiền mặt tại quầy',
  TRU_VAO_COC: 'Trừ vào tiền cọc',
  VNPAY: 'VNPay',
  MOMO: 'MoMo',
  CARD: 'Thẻ ngân hàng',
}

/** Cửa sổ xem hóa đơn của một khoản thu: từng dòng, khấu trừ, hoàn cọc, ghi chú, yêu cầu sửa chữa liên quan. */
export default function InvoiceModal({ paymentId, onClose }) {
  const { data: inv, loading, error, reload } = useAsync(
    () => (paymentId ? api.payments.invoice(paymentId) : Promise.resolve(null)),
    [paymentId]
  )

  const row = (k, v) => v ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 14 }}>
      <span className="muted">{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  ) : null

  return (
    <Modal
      wide
      open={!!paymentId}
      title={inv ? inv.title : 'Hóa đơn'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> In hóa đơn</Button>
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> : inv && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>SAFESPACE STORAGE</div>
              <div className="muted small">Công ty TNHH SafeSpace Storage</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>Số hóa đơn: <strong>{inv.invoiceNumber}</strong></div>
              <div className="muted small">Ngày lập: {fmtDateTime(inv.issuedAt)}</div>
              <div className="small"><strong>{inv.waivedAt ? 'Đã miễn' : (STATUS_VI[inv.status] || inv.status)}</strong></div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '8px 0', marginBottom: 12 }}>
            {inv.waivedAt && row('Lý do miễn phí', inv.waivedReason)}
            {row('Khách hàng', `${inv.customerName || ''}${inv.customerEmail ? ' · ' + inv.customerEmail : ''}`)}
            {row('Cơ sở', [inv.facilityName, inv.facilityAddress].filter(Boolean).join(' · '))}
            {row('Ô kho', inv.unitCode)}
            {row('Thanh toán lúc', inv.paidAt ? fmtDateTime(inv.paidAt) : null)}
            {row('Phương thức', inv.paymentMethod ? (METHOD_VI[inv.paymentMethod] || inv.paymentMethod) : null)}
            {row('Mã giao dịch', inv.status === 'PAID' ? inv.transactionReference : null)}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px dashed rgba(148,163,184,.5)' }}>
                  <td style={{ padding: '7px 0' }}>{l.label}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700, color: l.kind === 'DEDUCTION' ? '#b91c1c' : undefined }}>
                    {l.kind === 'INFO' ? '' : (l.amount < 0 ? '- ' : '') + money(Math.abs(l.amount))}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '10px 0', fontWeight: 800 }}>
                  {inv.refund ? 'Số tiền hoàn lại cho khách' : 'Tổng cộng'}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, fontSize: 18 }}>{money(inv.total)}</td>
              </tr>
            </tbody>
          </table>

          {inv.refund && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(212,160,23,.12)', fontSize: 14 }}>
              <div>Tiền cọc đã nộp: <strong>{money(inv.refund.depositPaid)}</strong></div>
              <div>Tổng khấu trừ: <strong style={{ color: '#b91c1c' }}>{money(inv.refund.deducted)}</strong></div>
              <div>Hoàn lại: <strong>{money(inv.refund.refundAmount)}</strong> ·{' '}
                {inv.refund.transferred
                  ? <>đã chuyển khoản lúc {fmtDateTime(inv.refund.transferredAt)}{inv.refund.transferReference ? ` (mã ${inv.refund.transferReference})` : ''}</>
                  : <>chờ công ty chuyển khoản về tài khoản bạn đã dùng đóng cọc</>}
              </div>
            </div>
          )}

          {inv.notes?.length > 0 && (
            <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 14 }}>
              {inv.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {inv.relatedRepairs?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 14 }}>Yêu cầu hỗ trợ / sửa chữa trong thời gian thuê</strong>
              <ul style={{ paddingLeft: 18, fontSize: 14, marginTop: 4 }}>
                {inv.relatedRepairs.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

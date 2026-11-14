import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal, Button, LoadingState, Textarea } from './ui.jsx'
import { api } from '../api/client.js'
import { money, fmtDate } from '../utils/format.js'
import { useToast } from '../hooks/useToast.jsx'

/** Các dòng luật hủy hợp đồng sớm (sau khi đã nhận kho), dùng cho khách, trang Chính sách và quản lý. */
export function EarlyTerminationRuleItems({ policy }) {
  const notice = policy?.earlyTerminationNoticeDays ?? 7
  const forfeit = policy?.earlyTerminationForfeitPercent ?? 100
  return (
    <>
      <li>Khách phải <strong>báo trước {notice} ngày</strong>. Tiền thuê được tính đến hết thời gian báo trước hoặc đến ngày trả kho thực tế (ngày nào muộn hơn).</li>
      <li>Tiền thuê tính <strong>trọn tháng</strong>: tháng nào đã bắt đầu thì tính đủ cả tháng đó, dù chỉ dùng vài ngày. Các tháng chưa dùng được <strong>hoàn lại</strong>.</li>
      <li><strong>{forfeit >= 100 ? 'Mất toàn bộ tiền cọc' : `Mất ${forfeit}% tiền cọc`}</strong> do hủy hợp đồng trước hạn{forfeit < 100 ? `, phần còn lại được hoàn` : ''}.</li>
      <li>Quản lý sẽ liên hệ khách, cử nhân viên kiểm tra kho. Nếu có hư hại hoặc phí phát sinh, phí được trừ vào số tiền hoàn; nếu không đủ, khách thanh toán phần còn thiếu.</li>
      <li>Hợp đồng chỉ kết thúc khi <strong>quản lý xác nhận hủy</strong>. Trước đó hợp đồng vẫn có hiệu lực và khách có thể rút lại yêu cầu (khi nhân viên chưa kiểm tra kho).</li>
    </>
  )
}

/** Cửa sổ khách yêu cầu hủy hợp đồng sớm: xem luật và số tiền dự kiến, tích đồng ý rồi gửi. */
export function EarlyTerminationModal({ contract, onClose, onDone }) {
  const toast = useToast()
  const [quote, setQuote] = useState(null)
  const [agree, setAgree] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setQuote(null); setAgree(false); setReason('')
    if (!contract) return undefined
    let alive = true
    api.terminations.quote(contract.id).then((q) => { if (alive) setQuote(q) }).catch((e) => { toast(e.message, 'error'); onClose() })
    return () => { alive = false }
  }, [contract?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true)
    try {
      await api.terminations.request(contract.id, { agreed: true, reason: reason.trim() || undefined })
      toast('Đã gửi yêu cầu hủy hợp đồng. Quản lý cơ sở sẽ liên hệ với bạn để hẹn kiểm tra kho.')
      onDone()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const row = (label, value, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontWeight: strong ? 700 : 400 }}>
      <span className="muted">{label}</span><span>{value}</span>
    </div>
  )

  return (
    <Modal wide open={!!contract} title={contract ? `Yêu cầu hủy hợp đồng sớm · Ô ${contract.unitCode}` : 'Hủy hợp đồng sớm'} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="danger" onClick={submit} loading={busy} disabled={!agree || !quote?.canRequest}>Đồng ý và gửi yêu cầu hủy</Button>
      </>}>
      {!quote ? <LoadingState /> : (
        <div style={{ display: 'grid', gap: 16 }}>
          {!quote.canRequest && (
            <div style={{ display: 'flex', gap: 8, padding: 12, borderRadius: 10, background: 'var(--red-soft)', color: 'var(--red)' }}>
              <AlertTriangle size={18} /> {quote.blockedReason}
            </div>
          )}
          <div>
            <h4 style={{ margin: '0 0 8px' }}>Quy định khi hủy hợp đồng sớm</h4>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, lineHeight: 1.5 }}>
              <EarlyTerminationRuleItems policy={{ earlyTerminationNoticeDays: quote.noticeDays, earlyTerminationForfeitPercent: quote.forfeitPercent }} />
            </ul>
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>Số tiền dự kiến nếu hủy hôm nay</h4>
            {row('Thời hạn hợp đồng', `${quote.monthsTotal} tháng · ${money(quote.monthlyRent)} / tháng`)}
            {row('Tiền thuê tính đến', `${fmtDate(quote.effectiveDate)} (${quote.usedMonths} tháng)`)}
            {row('Tiền thuê đã đóng', money(quote.rentPaid))}
            {row('Tiền thuê các tháng đã dùng (không hoàn)', `− ${money(quote.rentUsed)}`)}
            {row(`Tiền cọc ${money(quote.deposit)}: bị giữ ${quote.forfeitPercent}%`, `− ${money(quote.depositForfeited)}`)}
            {quote.pendingFees > 0 && row('Phí phát sinh chưa thanh toán', `− ${money(quote.pendingFees)}`)}
            {quote.estimatedExtra > 0
              ? row('Dự kiến bạn còn phải thanh toán', money(quote.estimatedExtra), true)
              : row('Dự kiến được hoàn lại', money(quote.estimatedRefund), true)}
            <p className="muted small" style={{ margin: '8px 0 0' }}>Số tiền chính thức được chốt sau khi nhân viên kiểm tra kho (chưa gồm phí hư hại nếu có).</p>
          </div>
          <Textarea label="Lý do hủy (không bắt buộc)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
            <span>Tôi đã đọc và đồng ý với các quy định hủy hợp đồng sớm ở trên, bao gồm việc mất tiền cọc theo quy định.</span>
          </label>
        </div>
      )}
    </Modal>
  )
}

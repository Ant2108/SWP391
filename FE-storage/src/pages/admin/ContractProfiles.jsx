import { useEffect, useState } from 'react'
import { unitTypeLabel } from '../../utils/format.js'
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { PageHeader, Card, Button, Modal, Textarea, LoadingState, ErrorState, EmptyState, Badge } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, fetchPrivateImage } from '../../api/client.js'
import { fmtDate, fmtDateTime } from '../../utils/format.js'
import { REJECT_REASONS } from '../account/ContractProfile.jsx'

function IdImage({ reservationId, side, label }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    fetchPrivateImage(`/contract-profiles/reservation/${reservationId}/id-image/${side}`)
      .then((u) => { url = u; setSrc(u) }).catch(() => setSrc(''))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [reservationId, side])
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="muted small" style={{ marginBottom: 4 }}>{label}</div>
      {src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={label} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} /></a>
        : <div className="muted">Không có ảnh</div>}
    </div>
  )
}

/** Quản lý kiểm tra hồ sơ thông tin hợp đồng: duyệt hoặc từ chối nhanh bằng lý do chọn sẵn. */
export default function ContractProfiles() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => api.contractProfiles.pendingReview())
  const [open, setOpen] = useState(null)
  const [reasons, setReasons] = useState([])
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = () => { setOpen(null); setReasons([]); setNote(''); setRejecting(false) }
  const toggle = (c) => setReasons((r) => (r.includes(c) ? r.filter((x) => x !== c) : [...r, c]))

  const approve = async () => {
    setBusy(true)
    try {
      await api.contractProfiles.approve(open.reservationId)
      toast('Đã duyệt hồ sơ.')
      close(); reload()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const reject = async () => {
    if (reasons.length === 0 && !note.trim()) { toast('Chọn ít nhất một lý do hoặc nhập ghi chú.', 'error'); return }
    setBusy(true)
    try {
      await api.contractProfiles.reject(open.reservationId, { reasonCodes: reasons, note: note.trim() || undefined })
      toast('Đã từ chối hồ sơ, khách sẽ nhận thông báo để chỉnh sửa và ký lại.')
      close(); reload()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const row = (k, v) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px dashed rgba(148,163,184,.4)', fontSize: 14 }}>
      <span className="muted">{k}</span><strong style={{ textAlign: 'right' }}>{v || '-'}</strong>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Hồ sơ hợp đồng chờ kiểm tra"
        subtitle="Đối chiếu thông tin khai báo với ảnh CCCD. Nếu sai lệch, từ chối để khách chỉnh và ký lại. Sai 2 lần được cảnh báo, sai 3 lần bắt buộc ký tại quầy."
        actions={<Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Làm mới</Button>}
      />
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> : (data || []).length === 0 ? (
        <EmptyState title="Không có hồ sơ nào đang chờ kiểm tra" />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.map((p) => (
            <Card key={p.id} hover style={{ cursor: 'pointer' }} onClick={() => setOpen(p)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{p.fullName} <span className="muted small">· Đơn #{p.reservationId}</span></div>
                  <div className="muted small">{p.facilityName} · {unitTypeLabel(p.unitTypeName)} · gửi lúc {fmtDateTime(p.submittedAt)}{p.filledByStaffName ? ` · nhân viên ${p.filledByStaffName} điền hộ` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {p.rejectCount > 0 && <Badge tone={p.rejectCount >= 2 ? 'red' : 'yellow'}>Đã bị từ chối {p.rejectCount} lần</Badge>}
                  {p.signAtCounterRequired && <Badge tone="red">Phải ký tại quầy</Badge>}
                  <Badge tone="yellow">Chờ kiểm tra</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        wide
        open={!!open}
        title={open ? `Hồ sơ của ${open.fullName} (đơn #${open.reservationId})` : ''}
        onClose={close}
        footer={
          rejecting ? (
            <>
              <Button variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>Quay lại</Button>
              <Button variant="danger-outline" loading={busy} onClick={reject}><XCircle size={15} /> Xác nhận từ chối</Button>
            </>
          ) : (
            <>
              <Button variant="danger-outline" onClick={() => setRejecting(true)}><XCircle size={15} /> Từ chối / yêu cầu ký lại</Button>
              <Button loading={busy} onClick={approve}><CheckCircle2 size={15} /> Duyệt hồ sơ</Button>
            </>
          )
        }
      >
        {open && (
          <div>
            {open.rejectCount >= 2 && (
              <div style={{ border: '1.5px solid #b91c1c', color: '#b91c1c', borderRadius: 10, padding: 10, marginBottom: 12, fontWeight: 600 }}>
                Khách này đã bị từ chối {open.rejectCount} lần. {open.rejectCount >= 2 ? 'Lần từ chối tiếp theo sẽ bắt buộc ký tại quầy.' : ''} Hãy kiểm tra thật kỹ.
              </div>
            )}
            {!rejecting ? (
              <>
                <div className="form-grid">
                  <IdImage reservationId={open.reservationId} side="front" label="CCCD mặt trước" />
                  <IdImage reservationId={open.reservationId} side="back" label="CCCD mặt sau" />
                </div>
                <div style={{ marginTop: 12 }}>
                  {row('Họ và tên', open.fullName)}
                  {row('Ngày sinh', fmtDate(open.dateOfBirth))}
                  {row('Giới tính / Quốc tịch', `${open.gender || ''} / ${open.nationality || ''}`)}
                  {row('Số CCCD', open.nationalId)}
                  {row('Ngày cấp / Nơi cấp', `${fmtDate(open.idIssueDate)} · ${open.idIssuePlace || ''}`)}
                  {row('Thường trú', open.permanentAddress)}
                  {row('Liên hệ', open.contactAddress)}
                  {row('Điện thoại / Email', `${open.phone || ''} · ${open.email || ''}`)}
                  {row('Nghề nghiệp', open.occupation)}
                  {row('Hàng hóa dự kiến', open.goodsDescription)}
                  {row('Liên hệ khẩn cấp', `${open.emergencyName || ''} · ${open.emergencyPhone || ''}`)}
                </div>
              </>
            ) : (
              <div>
                <p className="muted">Chọn nhanh lý do (có thể chọn nhiều). Ghi chú chi tiết là tùy chọn.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 12px' }}>
                  {Object.entries(REJECT_REASONS).map(([code, label]) => (
                    <button key={code} type="button" className={`chip ${reasons.includes(code) ? 'active' : ''}`} onClick={() => toggle(code)}>
                      {label}
                    </button>
                  ))}
                </div>
                <Textarea label="Ghi chú thêm cho khách (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

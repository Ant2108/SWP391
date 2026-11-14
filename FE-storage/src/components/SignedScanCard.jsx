import { useState } from 'react'
import { Upload, CheckCircle2, XCircle } from 'lucide-react'
import { Card, Button, Textarea, Badge } from './ui.jsx'
import { api, assetUrl } from '../api/client.js'
import { useToast } from '../hooks/useToast.jsx'

/**
 * Khách ký giấy tại chỗ: nhân viên / quản lý tải ảnh hợp đồng đã ký lên.
 * Ảnh chỉ tải một lần và phải được quản lý cơ sở duyệt thì hợp đồng mới tính là đã ký
 * (quản lý tự tải thì được duyệt luôn). Bị từ chối thì được tải lại.
 */
export default function SignedScanCard({ contract, reservationId, profile, role, onChanged }) {
  // Chế độ "đơn chưa có hợp đồng": ảnh được lưu trên hồ sơ và tự chép sang hợp đồng khi hợp đồng được tạo.
  const pre = !!reservationId
  const scan = pre
    ? { status: profile?.preScanStatus, url: profile?.preScanUrl, uploader: profile?.preScanUploader, note: profile?.preScanNote }
    : { status: contract.signedScanStatus, url: contract.signedScanUrl, uploader: contract.signedScanUploader, note: contract.signedScanNote }
  const call = {
    upload: (url) => (pre ? api.rentalContracts.uploadPreScan(reservationId, url) : api.rentalContracts.uploadSignedScan(contract.id, url)),
    approve: () => (pre ? api.rentalContracts.approvePreScan(reservationId) : api.rentalContracts.approveSignedScan(contract.id)),
    reject: (r) => (pre ? api.rentalContracts.rejectPreScan(reservationId, r) : api.rentalContracts.rejectSignedScan(contract.id, r)),
  }
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const status = scan.status
  const isManager = role === 'FACILITY_MANAGER'

  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      const updated = await fn()
      if (okMsg) toast(okMsg)
      setRejecting(false); setReason('')
      onChanged?.(updated)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const upload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Ảnh tối đa 5MB', 'error'); return }
    run(async () => {
      const { url } = await api.files.uploadImage(file)
      return call.upload(url)
    }, isManager ? 'Đã tải ảnh và ghi nhận hợp đồng đã ký.' : 'Đã tải ảnh lên, chờ quản lý cơ sở duyệt.')
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 6 }}>Ảnh hợp đồng đã ký tại chỗ</h3>
      <p className="muted small" style={{ marginBottom: 10 }}>
        Khách ký trên hợp đồng giấy: chụp rõ cả trang rồi tải lên. Ảnh chỉ tải một lần và cần quản lý cơ sở duyệt thì hợp đồng mới tính là đã ký.
      </p>

      {status === 'PENDING_REVIEW' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone="amber">Chờ quản lý duyệt</Badge>
            <span className="small muted">Tải bởi {scan.uploader}</span>
          </div>
          <a href={assetUrl(scan.url)} target="_blank" rel="noreferrer"><img src={assetUrl(scan.url)} alt="Ảnh hợp đồng đã ký" style={{ maxWidth: 360, width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
          {isManager && !rejecting && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" loading={busy} onClick={() => run(() => call.approve(), 'Đã duyệt: hợp đồng được ghi nhận là đã ký tại chỗ.')}><CheckCircle2 size={14} /> Duyệt ảnh</Button>
              <Button size="sm" variant="danger-outline" onClick={() => setRejecting(true)}><XCircle size={14} /> Từ chối</Button>
            </div>
          )}
          {isManager && rejecting && (
            <div style={{ display: 'grid', gap: 8 }}>
              <Textarea label="Lý do từ chối" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="danger-outline" loading={busy} disabled={!reason.trim()} onClick={() => run(() => call.reject(reason.trim()), 'Đã từ chối ảnh, nhân viên cần tải lại.')}>Xác nhận từ chối</Button>
                <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>Hủy</Button>
              </div>
            </div>
          )}
          {!isManager && <p className="small muted">Đang chờ quản lý cơ sở duyệt, không cần tải lại.</p>}
        </div>
      )}

      {status !== 'PENDING_REVIEW' && (
        <>
          {status === 'REJECTED' && (
            <p className="small" style={{ color: 'var(--danger, #dc2626)', marginBottom: 10 }}>
              Ảnh trước bị từ chối: {scan.note}. Vui lòng chụp lại và tải ảnh mới.
            </p>
          )}
          <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            <Upload size={14} /> {busy ? 'Đang tải…' : 'Tải ảnh hợp đồng đã ký'}
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={upload} disabled={busy} style={{ display: 'none' }} />
          </label>
        </>
      )}
    </Card>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, ShieldAlert, Upload, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Textarea, Modal, LoadingState, ErrorState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { api, fetchPrivateImage } from '../../api/client.js'
import { openBlankContract } from '../../utils/contractDocument.js'
import SignedScanCard from '../../components/SignedScanCard.jsx'

export const REJECT_REASONS = {
  ID_BLURRY: 'Ảnh CCCD mờ hoặc thiếu góc, không đọc được',
  ID_MISMATCH: 'Thông tin khai không khớp với giấy tờ tùy thân',
  INFO_MISMATCH: 'Thông tin cá nhân hoặc liên hệ chưa chính xác',
  SIGNATURE_INVALID: 'Chữ ký không rõ ràng hoặc khác với giấy tờ',
  ADDRESS_UNCLEAR: 'Địa chỉ chưa đầy đủ hoặc chưa rõ ràng',
  OTHER: 'Lý do khác (xem ghi chú)',
}

const EMPTY = {
  fullName: '', dateOfBirth: '', gender: 'Nam', nationality: 'Việt Nam', nationalId: '', idIssueDate: '', idIssuePlace: '',
  permanentAddress: '', contactAddress: '', phone: '', email: '', occupation: '', goodsDescription: '',
  emergencyName: '', emergencyPhone: '', agreedTruthful: false,
}

function IdUpload({ label, side, reservationId, uploaded, onDone, disabled }) {
  const toast = useToast()
  const ref = useRef(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let url = ''
    if (uploaded && !preview) {
      fetchPrivateImage(`/contract-profiles/reservation/${reservationId}/id-image/${side}`)
        .then((u) => { url = u; setPreview(u) }).catch(() => {})
    }
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [uploaded, reservationId, side]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Chỉ nhận ảnh JPG, PNG hoặc WebP.', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { toast('Ảnh tối đa 5MB.', 'error'); return }
    setBusy(true)
    try {
      await api.contractProfiles.uploadIdImage(reservationId, side, file)
      setPreview(URL.createObjectURL(file))
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div style={{ border: '1px dashed rgba(148,163,184,.7)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      {preview ? (
        <img src={preview} alt={label} style={{ maxWidth: '100%', maxHeight: 170, borderRadius: 8, objectFit: 'contain' }} />
      ) : (
        <div className="muted" style={{ padding: '30px 0' }}>Chưa có ảnh</div>
      )}
      {!disabled && (
        <div style={{ marginTop: 8 }}>
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
          <Button size="sm" variant="secondary" loading={busy} type="button" onClick={() => ref.current?.click()}>
            <Upload size={14} /> {uploaded ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Trang điền hồ sơ thông tin hợp đồng của khách (cũng dùng cho nhân viên điền hộ tại quầy). */
export function ProfileEditor({ id, embedded = false, onSubmitted }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profile, loading, error, reload } = useAsync(() => api.contractProfiles.get(id), [id])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [errs, setErrs] = useState({})

  // Điền sẵn một lần khi mở (từ bản đã lưu của khách, hoặc từ tài khoản); các lần tải lại sau đó (ví dụ sau khi tải ảnh CCCD)
  // không được ghi đè những gì khách đang gõ.
  const filledRef = useRef(false)
  const savedRef = useRef('')
  const [savedAt, setSavedAt] = useState(null)
  useEffect(() => {
    if (filledRef.current || loading) return
    filledRef.current = true
    if (!profile) {
      if (user) setForm((f) => ({ ...f, fullName: f.fullName || user.fullname || '', email: f.email || user.email || '', phone: f.phone || user.phone || '' }))
      return
    }
    const next = {
      ...EMPTY,
      ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, profile[k] ?? EMPTY[k]])),
      agreedTruthful: false,
    }
    savedRef.current = JSON.stringify({ ...next, agreedTruthful: false })
    setForm(next)
  }, [profile, loading, user])

  // Tự lưu nháp sau khi khách ngừng gõ một lúc, để lần sau mở lại không phải điền lại.
  useEffect(() => {
    if (!filledRef.current || profile?.status === 'APPROVED') return undefined
    const snapshot = JSON.stringify({ ...form, agreedTruthful: false })
    if (snapshot === savedRef.current) return undefined
    const timer = setTimeout(() => {
      const body = Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'agreedTruthful').map(([k, v]) => [k, v === '' ? null : v]))
      api.contractProfiles.saveDraft(id, body).then(() => { savedRef.current = snapshot; setSavedAt(new Date()) }).catch(() => {})
    }, 900)
    return () => clearTimeout(timer)
  }, [form]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const locked = profile?.status === 'APPROVED'

  const validate = () => {
    const e = {}
    const need = ['fullName', 'dateOfBirth', 'nationalId', 'idIssueDate', 'idIssuePlace', 'permanentAddress', 'phone', 'email', 'goodsDescription', 'emergencyName', 'emergencyPhone']
    need.forEach((k) => { if (!String(form[k] || '').trim()) e[k] = 'Vui lòng nhập' })
    if (form.nationalId && !/^(\d{9}|\d{12})$/.test(form.nationalId.trim())) e.nationalId = 'CCCD gồm 12 chữ số (hoặc CMND 9 chữ số)'
    if (form.phone && !/^(0|\+84)\d{9,10}$/.test(form.phone.trim())) e.phone = 'Số điện thoại không hợp lệ'
    if (form.emergencyPhone && !/^(0|\+84)\d{9,10}$/.test(form.emergencyPhone.trim())) e.emergencyPhone = 'Số điện thoại không hợp lệ'
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = 'Email không hợp lệ'
    if (form.dateOfBirth) {
      const adult = new Date(); adult.setFullYear(adult.getFullYear() - 18)
      if (new Date(form.dateOfBirth) > adult) e.dateOfBirth = 'Người ký hợp đồng phải đủ 18 tuổi'
    }
    if (!form.agreedTruthful) e.agreedTruthful = 'Cần xác nhận cam kết'
    setErrs(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!validate()) { toast('Vui lòng kiểm tra lại các ô báo đỏ.', 'error'); return }
    if (!profile?.hasIdFront || !profile?.hasIdBack) { toast('Vui lòng tải đủ ảnh CCCD mặt trước và mặt sau.', 'error'); return }
    setBusy(true)
    try {
      await api.contractProfiles.submit(id, form)
      if (onSubmitted) {
        toast('Đã gửi hồ sơ. Quản lý sẽ kiểm tra, quý khách có thể ký hợp đồng ngay trong mục Hợp đồng.')
        onSubmitted()
      } else if (user?.role === 'CUSTOMER') {
        toast('Đã gửi hồ sơ. Quản lý sẽ kiểm tra, quý khách có thể ký hợp đồng ngay trong mục Hợp đồng.')
        navigate('/account/contracts')
      } else {
        toast('Đã gửi hồ sơ thay cho khách. Bạn có thể cho khách ký tại quầy trong mục Hợp đồng.')
        navigate('/admin/reservations')
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const banner = () => {
    if (!profile) return null
    const map = {
      SUBMITTED: { icon: <Clock size={18} />, color: '#b45309', text: 'Hồ sơ đã gửi, đang chờ quản lý kiểm tra. Quý khách vẫn có thể ký hợp đồng.' },
      APPROVED: { icon: <CheckCircle2 size={18} />, color: '#15803d', text: 'Hồ sơ đã được duyệt, không thể chỉnh sửa.' },
      REJECTED: { icon: <XCircle size={18} />, color: '#b91c1c', text: 'Hồ sơ chưa được chấp nhận. Vui lòng chỉnh theo lý do bên dưới và gửi lại.' },
    }[profile.status]
    if (!map) return null
    return (
      <div style={{ border: `1.5px solid ${map.color}`, color: map.color, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>{map.icon} {map.text}</div>
        {profile.status === 'REJECTED' && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {(profile.rejectReasonCodes || []).map((c) => <li key={c}>{REJECT_REASONS[c] || c}</li>)}
            {profile.rejectNote && <li>Ghi chú của quản lý: {profile.rejectNote}</li>}
            <li>Số lần chưa đạt: {profile.rejectCount}/3{profile.signAtCounterRequired ? '. Quý khách cần ký trực tiếp tại quầy khi nhận kho.' : '.'}</li>
          </ul>
        )}
      </div>
    )
  }

  return (
    <>
      {!embedded && <PageHeader
        eyebrow={
          <Link to={user?.role === 'CUSTOMER' ? '/account/reservations' : '/admin/reservations'}>
            <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> {user?.role === 'CUSTOMER' ? 'Đơn đặt kho' : 'Quay lại quản lý đơn'}
          </Link>
        }
        title="Hồ sơ thông tin hợp đồng"
        subtitle="Vui lòng điền chính xác theo giấy tờ tùy thân. Hệ thống dùng thông tin này để lập hợp đồng pháp lý của quý khách."
        actions={<Button variant="secondary" onClick={() => openBlankContract(user)}><FileText size={15} /> Xem hợp đồng mẫu</Button>}
      />}
      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <Button size="sm" variant="secondary" type="button" onClick={() => openBlankContract(user)}><FileText size={14} /> Xem hợp đồng mẫu</Button>
        </div>
      )}
      {banner()}
      {savedAt && <div className="muted small" style={{ textAlign: 'right', marginBottom: 6 }}>Đã lưu nháp lúc {savedAt.toLocaleTimeString('vi-VN')}</div>}
      <form onSubmit={submit}>
        <Card>
          <h3 style={{ marginBottom: 12 }}>1. Thông tin cá nhân</h3>
          <div className="form-grid">
            <Input label="Họ và tên (đúng như CCCD) *" value={form.fullName} onChange={set('fullName')} error={errs.fullName} disabled={locked} />
            <Input label="Ngày sinh *" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={errs.dateOfBirth} disabled={locked} />
            <Select label="Giới tính" value={form.gender} onChange={set('gender')} disabled={locked}>
              <option>Nam</option><option>Nữ</option><option>Khác</option>
            </Select>
            <Input label="Quốc tịch" value={form.nationality} onChange={set('nationality')} disabled={locked} />
            <Input label="Số CCCD / CMND *" inputMode="numeric" value={form.nationalId} onChange={set('nationalId')} error={errs.nationalId} disabled={locked} />
            <Input label="Ngày cấp *" type="date" value={form.idIssueDate} onChange={set('idIssueDate')} error={errs.idIssueDate} disabled={locked} />
            <div className="span-2"><Input label="Nơi cấp *" value={form.idIssuePlace} onChange={set('idIssuePlace')} error={errs.idIssuePlace} disabled={locked} placeholder="VD: Cục Cảnh sát QLHC về TTXH" /></div>
            <div className="span-2"><Input label="Địa chỉ thường trú *" value={form.permanentAddress} onChange={set('permanentAddress')} error={errs.permanentAddress} disabled={locked} /></div>
            <div className="span-2"><Input label="Địa chỉ liên hệ (bỏ trống nếu giống thường trú)" value={form.contactAddress} onChange={set('contactAddress')} disabled={locked} /></div>
            <Input label="Số điện thoại *" inputMode="tel" value={form.phone} onChange={set('phone')} error={errs.phone} disabled={locked} />
            <Input label="Email *" type="email" value={form.email} onChange={set('email')} error={errs.email} disabled={locked} />
            <div className="span-2"><Input label="Nghề nghiệp" value={form.occupation} onChange={set('occupation')} disabled={locked} /></div>
          </div>

          <h3 style={{ margin: '24px 0 12px' }}>2. Hàng hóa dự kiến lưu kho</h3>
          <Textarea label="Mô tả loại hàng hóa *" value={form.goodsDescription} onChange={set('goodsDescription')} error={errs.goodsDescription} disabled={locked}
            hint="Hàng cấm: vũ khí, chất cháy nổ, hóa chất độc hại, động thực vật sống, hàng không rõ nguồn gốc." />

          <h3 style={{ margin: '24px 0 12px' }}>3. Người liên hệ khẩn cấp</h3>
          <div className="form-grid">
            <Input label="Họ và tên *" value={form.emergencyName} onChange={set('emergencyName')} error={errs.emergencyName} disabled={locked} />
            <Input label="Số điện thoại *" inputMode="tel" value={form.emergencyPhone} onChange={set('emergencyPhone')} error={errs.emergencyPhone} disabled={locked} />
          </div>

          <h3 style={{ margin: '24px 0 12px' }}>4. Ảnh CCCD / CMND</h3>
          <p className="muted small" style={{ marginTop: -6 }}>Chụp rõ nét, đủ 4 góc, không lóa. Ảnh được lưu riêng tư, chỉ nhân viên có thẩm quyền xem được.</p>
          <div className="form-grid">
            <IdUpload label="Mặt trước *" side="front" reservationId={id} uploaded={profile?.hasIdFront} onDone={reload} disabled={locked} />
            <IdUpload label="Mặt sau *" side="back" reservationId={id} uploaded={profile?.hasIdBack} onDone={reload} disabled={locked} />
          </div>

          {!locked && (
            <>
              <div style={{ marginTop: 20, padding: 14, border: '1.5px solid #b91c1c', background: 'rgba(185,28,28,.08)', borderRadius: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, color: '#b91c1c' }}><ShieldAlert size={18} /> Cam kết trách nhiệm</div>
                <p style={{ margin: '6px 0 10px', fontSize: 14 }}>
                  Thông tin khai báo là căn cứ pháp lý của hợp đồng. Nếu phát hiện thông tin sai sự thật, giấy tờ giả mạo hoặc chữ ký không hợp lệ,
                  SafeSpace có quyền từ chối hồ sơ, hủy hợp đồng và xử lý khoản cọc theo điều khoản đã thỏa thuận.
                </p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.agreedTruthful} onChange={set('agreedTruthful')} style={{ marginTop: 4 }} />
                  <span>Tôi cam kết toàn bộ thông tin và giấy tờ trên là đúng sự thật và chịu trách nhiệm về tính chính xác của chúng.</span>
                </label>
                {errs.agreedTruthful && <div className="field-error">{errs.agreedTruthful}</div>}
              </div>
              <Button type="submit" size="lg" loading={busy} style={{ marginTop: 18, width: '100%' }}>
                {profile?.status === 'REJECTED' ? 'Gửi lại hồ sơ' : 'Gửi hồ sơ'}
              </Button>
              <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>
                Quý khách cũng có thể đến cơ sở gặp nhân viên để điền và ký trực tiếp tại quầy.
              </p>
            </>
          )}
        </Card>
      </form>
    </>
  )
}

/** Trang điền hồ sơ (dùng cho đường dẫn riêng, ví dụ nhân viên điền hộ khách). */
export default function ContractProfile() {
  const { id } = useParams()
  return (
    <>
      <ProfileEditor id={id} />
      <PreScanSection id={id} />
    </>
  )
}

/** Nhân viên / quản lý: khách ký giấy tại chỗ khi chưa gán ô kho thì tải ảnh hợp đồng đã ký ở đây (quản lý duyệt). */
function PreScanSection({ id }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const load = () => api.contractProfiles.get(id).then((p) => setProfile(p || null)).catch(() => setProfile(null))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!['FACILITY_STAFF', 'FACILITY_MANAGER'].includes(user?.role)) return null
  if (!profile || profile.hasContract || !['SUBMITTED', 'APPROVED'].includes(profile.status) || profile.preSignedAt) return null
  return <SignedScanCard reservationId={Number(id)} profile={profile} role={user.role} onChanged={load} />
}

/** Cửa sổ nổi để khách điền hồ sơ hợp đồng ngay tại trang đang xem, không phải chuyển trang. */
export function ContractProfileModal({ reservationId, onClose, onSubmitted }) {
  return (
    <Modal wide open={!!reservationId} title="Hồ sơ thông tin hợp đồng" onClose={onClose}>
      {reservationId && <ProfileEditor id={reservationId} embedded onSubmitted={onSubmitted || onClose} />}
    </Modal>
  )
}

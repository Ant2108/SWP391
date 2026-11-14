import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserPlus, CalendarClock, XCircle, UserX, KeyRound, ClipboardCheck, Flag, CheckCircle2, Banknote } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, Textarea, ConfirmDialog, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { orNull, numOrNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useToast } from '../../hooks/useToast.jsx'
import { api, APPOINTMENT_TYPES, APPOINTMENT_STATUSES, DAMAGE_ITEMS } from '../../api/client.js'
import { fmtDate, fmtDateTime, label } from '../../utils/format.js'
import { displayStatus } from '../../utils/appointment.js'

const checkbox = { display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }
const actionsRow = { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }

// Staff: việc hôm nay được gán cho mình (check-in, trả kho, báo khách vắng). Manager: gán staff, đổi lịch,
// hủy, đánh NO_SHOW và xử lý các lịch staff đã báo khách không đến. Admin: chỉ xem.
export default function Appointments() {
  const { user } = useAuth()
  const toast = useToast()
  const isManager = user?.role === 'FACILITY_MANAGER'
  const isStaff = user?.role === 'FACILITY_STAFF'
  const canWork = isManager || isStaff

  // Staff mở sẵn "Hôm nay" (việc được gán cho mình hôm nay). Manager và admin mở sẵn "Tất cả lịch hẹn":
  // manager cần thấy cả lịch chưa gán nhân viên hoặc đã quá hạn, nếu mặc định "Hôm nay" sẽ tưởng lịch bị mất.
  const [params] = useSearchParams()
  const [view, setView] = useState(params.get('view') === 'damage' ? 'damage' : isStaff ? 'today' : 'all') // today | all | noshow | damage
  const [damageStatus, setDamageStatus] = useState('REPORTED')
  const [filters, setFilters] = useState({ type: '', status: '', date: '' })
  const list = useAsync(() => {
    if (view === 'damage') return api.unitReturns.damage({ damageStatus: damageStatus || undefined })
    if (view === 'today') return api.appointments.today()
    return api.appointments.list({ ...filters, noShowReported: view === 'noshow' ? true : undefined })
  }, [view, filters.type, filters.status, filters.date, damageStatus])

  const [modal, setModal] = useState(null) // { kind, appt }
  const [form, setForm] = useState({})
  const staffList = useAsync(
    () => (modal?.kind === 'assign' ? api.appointments.staff() : Promise.resolve([])),
    [modal?.kind, modal?.appt?.id])
  const staffOptions = staffList.data || []
  // Khách đến trả kho không cần hẹn trước: staff chọn hợp đồng đang thuê của cơ sở rồi ghi biên bản trả kho.
  const returnable = useAsync(
    () => (modal?.kind === 'return' && !modal.appt
      ? Promise.all([api.rentalContracts.list({ status: 'ACTIVE' }), api.rentalContracts.list({ status: 'OVERDUE' })]).then((r) => r.flat())
      : Promise.resolve([])),
    [modal?.kind, modal?.appt?.id])
  const returnableContracts = returnable.data || []

  const open = (kind, appt, initial = {}) => { setModal({ kind, appt }); setForm(initial) }
  const close = () => setModal(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const done = (msg) => { toast(msg); close(); list.reload() }

  const submit = async () => {
    const { kind, appt } = modal
    if (kind === 'assign') {
      if (!form.staffId) throw new Error('Vui lòng chọn nhân viên')
      await api.appointments.assign(appt.id, Number(form.staffId)); done('Đã gán nhân viên')
    } else if (kind === 'reschedule') {
      if (!form.date) throw new Error('Vui lòng chọn ngày')
      await api.appointments.reschedule(appt.id, `${form.date}T${form.time || '09:00'}:00`); done('Đã đổi lịch hẹn')
    } else if (kind === 'complete') {
      if (appt.appointmentType === 'CHECK_IN' && (!appt.unitAssigned || appt.reservationStatus !== 'CONFIRMED')) throw new Error('Quản lý cần gán ô kho cho đơn này trước (mục Đơn thuê & hợp đồng)')
      if (appt.appointmentType === 'CHECK_IN' && !appt.contractSigned) throw new Error('Khách cần ký hợp đồng thuê kho trước khi nhận kho')
      await api.appointments.complete(appt.id, { keyHandedOver: appt.appointmentType === 'CHECK_IN' ? !!form.keyHandedOver : undefined, notes: orNull(form.notes) })
      done(appt.appointmentType === 'CHECK_IN' ? 'Đã nhận kho thành công. Hợp đồng đã có hiệu lực.' : 'Đã hoàn tất lịch hẹn')
    } else if (kind === 'return') {
      if (!appt && !form.contractId) throw new Error('Vui lòng chọn hợp đồng thuê kho đang trả')
      if (form.hasDamage && !(form.damageItems || []).length && !(form.damageDescription || '').trim()) throw new Error('Vui lòng chọn ít nhất một loại hư hại, hoặc mô tả ở mục Hư hại khác')
      if (form.hasDamage && (form.damageItems || []).includes('OTHER') && !(form.damageDescription || '').trim()) throw new Error('Vui lòng mô tả hư hại ở mục Hư hại khác')
      const r = await api.unitReturns.create({
        rentalContractId: appt ? appt.rentalContractId : Number(form.contractId), appointmentId: appt?.id, unitCondition: orNull(form.unitCondition),
        hasDamage: !!form.hasDamage, damageItems: form.hasDamage ? (form.damageItems || []) : undefined,
        damageDescription: form.hasDamage ? orNull(form.damageDescription) : null, notes: orNull(form.notes),
      })
      if (r.unitStatus === 'OCCUPIED') done('Đã ghi nhận kiểm tra kho. Quản lý sẽ xác nhận hủy hợp đồng ở mục Hủy hợp đồng sớm.')
      else done(r.hasDamage ? 'Đã ghi nhận trả kho. Ô kho chuyển sang bảo trì và quản lý đã được báo về hư hại.' : 'Đã ghi nhận trả kho. Ô kho đã trống trở lại.')
    } else if (kind === 'fee') {
      const keys = reportedKeys(appt)
      const itemFees = {}
      for (const k of keys) {
        const v = (form.fees || {})[k]
        if (v === undefined || v === '' || Number(v) < 0) throw new Error('Vui lòng nhập phí cho từng hạng mục hư hại (nhập 0 nếu không thu)')
        itemFees[k] = Number(v)
      }
      await api.unitReturns.issueDamageFee(appt.id, itemFees); done('Đã chốt phí hư hại. Khách hàng đã được thông báo.')
    } else if (kind === 'report') {
      await api.appointments.reportNoShow(appt.id, form.note || ''); done('Đã báo cáo cho quản lý cơ sở')
    }
  }

  // Khách trả nốt đợt 2 (tiền thuê) tại quầy: staff / manager đánh dấu đã thu rồi mới check-in được.
  const [collecting, setCollecting] = useState(false)
  const collectRental = async () => {
    const appt = modal.appt
    setCollecting(true)
    try {
      await api.payments.markPaid(appt.pendingRentalPaymentId, { paymentMethod: 'CASH', transactionReference: `CASH-COUNTER-${appt.id}-${Date.now()}` })
      setModal({ ...modal, appt: { ...appt, rentalPaid: true, pendingRentalPaymentId: null } })
      toast('Đã ghi nhận thanh toán. Bạn có thể cho khách nhận kho.')
      list.reload()
    } catch (e) { toast(e.message, 'error') } finally { setCollecting(false) }
  }

  const confirm = async () => {
    const { kind, appt } = modal
    try {
      if (kind === 'cancel') { await api.appointments.cancel(appt.id); done('Đã hủy lịch hẹn') }
      else { await api.appointments.markNoShow(appt.id); done('Đã đánh dấu khách không đến') }
    } catch (e) { toast(e.message, 'error') }
  }

  const rowActions = (a) => {
    if (a.status !== 'SCHEDULED') return null
    const mine = a.staffId === user?.userId
    return (
      <div style={actionsRow}>
        {isManager && <Button size="sm" variant="secondary" onClick={() => open('assign', a, { staffId: a.staffId || '' })}><UserPlus size={14} /> {a.staffId ? 'Đổi nhân viên' : 'Gán nhân viên'}</Button>}
        {isManager && <Button size="sm" variant="secondary" onClick={() => open('reschedule', a, { date: a.scheduledAt.slice(0, 10), time: a.scheduledAt.slice(11, 16) })}><CalendarClock size={14} /> Đổi lịch</Button>}
        {isStaff && mine && a.appointmentType === 'RETURN' && <Button size="sm" onClick={() => open('return', a, { hasDamage: false })}><ClipboardCheck size={14} /> Kiểm tra và nhận trả kho</Button>}
        {(isStaff && mine || isManager) && a.appointmentType === 'CHECK_IN' && !a.contractSigned && (
          <span className="small" style={{ color: 'var(--warning, #d97706)', alignSelf: 'center' }}>
            Chưa ký hợp đồng. Vào "Đơn thuê & hợp đồng" để ký tại quầy hoặc tải ảnh hợp đồng đã ký.
          </span>
        )}
        {(isStaff && mine || isManager) && a.appointmentType === 'CHECK_IN' && (
          <Button size="sm" disabled={!a.contractSigned} title={a.contractSigned ? undefined : 'Khách cần ký hợp đồng thuê kho trước khi nhận kho'} onClick={() => open('complete', a, { keyHandedOver: false })}><KeyRound size={14} /> Nhận kho</Button>
        )}
        {(isStaff && mine || isManager) && a.appointmentType === 'SUPPORT' && <Button size="sm" onClick={() => open('complete', a, {})}><CheckCircle2 size={14} /> Hoàn tất</Button>}
        {isStaff && mine && !a.noShowReported && <Button size="sm" variant="secondary" onClick={() => open('report', a, { note: '' })}><Flag size={14} /> Báo khách không đến</Button>}
        {isManager && <Button size="sm" variant="danger-outline" onClick={() => open('noshow', a)}><UserX size={14} /> Khách không đến</Button>}
        {isManager && <Button size="sm" variant="danger-outline" onClick={() => open('cancel', a)}><XCircle size={14} /> Hủy</Button>}
      </div>
    )
  }

  const columns = [
    { key: 'when', header: 'Nhận kho / giờ hẹn', render: (a) => <><div className="cell-title">{fmtDateTime(a.scheduledAt)}</div><div className="cell-sub">#{a.id}{a.orderedAt && a.appointmentType === 'CHECK_IN' ? ` · ordered ${fmtDate(a.orderedAt)}` : ''}</div></> },
    { key: 'customer', header: 'Khách hàng', render: (a) => <><div className="cell-title">{a.customerName}</div><div className="cell-sub">{a.customerPhone || '—'}</div></> },
    { key: 'what', header: 'Lịch hẹn', render: (a) => <><div className="cell-title">{label(a.appointmentType)}</div><div className="cell-sub">{[a.unitCode && `Ô ${a.unitCode}`, a.facilityName].filter(Boolean).join(' · ')}</div></> },
    ...(isStaff ? [] : [{ key: 'staff', header: 'Nhân viên', render: (a) => a.staffName || <span className="muted">Chưa gán</span> }]),
    { key: 'status', header: 'Trạng thái', render: (a) => (
      <>
        <Badge tone={displayStatus(a).tone}>{displayStatus(a).text}</Badge>
        {a.appointmentType === 'CHECK_IN' && a.status === 'SCHEDULED' && (
          <div className="cell-sub">Cọc {a.depositPaid ? 'đã đóng' : 'chưa đóng'} · Tiền thuê {a.rentalPaid ? 'đã đóng' : 'chưa đóng'}</div>)}
        {a.noShowReported && <div style={{ marginTop: 6 }}><Badge tone="red">Đã báo khách không đến</Badge></div>}
        {a.notes && <div className="cell-sub" style={{ maxWidth: 260 }}>{a.notes}</div>}
      </>) },
    { key: 'actions', header: '', className: 'actions', render: rowActions },
  ]

  // Hạng mục staff đã báo; nếu chỉ có mô tả thì coi là mục Other.
  const reportedKeys = (u) => ((u.damageItems || []).length ? u.damageItems : ['OTHER'])
  const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} VND`
  const damageTotal = (u, fees) => reportedKeys(u).reduce((sum, k) => sum + (Number((fees || {})[k]) || 0), 0)

  const damageColumns = [
    { key: 'unit', header: 'Ô kho', render: (u) => <><div className="cell-title">Unit {u.unitCode}</div><div className="cell-sub">{u.facilityName} · contract #{u.rentalContractId}</div></> },
    { key: 'customer', header: 'Khách hàng', render: (u) => <><div className="cell-title">{u.customerName}</div><div className="cell-sub">Returned {fmtDateTime(u.returnedAt)} · checked by {u.staffName}</div></> },
    { key: 'damage', header: 'Có hư hại', render: (u) => (
      <div style={{ maxWidth: 360 }}>
        <div className="cell-title">{(u.damageItems || []).map((k) => (DAMAGE_ITEMS.find((d) => d[0] === k) || [k, k])[1]).join(', ') || 'See description'}</div>
        {u.damageDescription && <div className="cell-sub" style={{ whiteSpace: 'pre-wrap' }}>{u.damageDescription}</div>}
      </div>) },
    { key: 'status', header: 'Trạng thái', render: (u) => u.damageStatus === 'FEE_ISSUED'
      ? <><Badge tone="green">Đã chốt phí</Badge><div className="cell-sub">Total {vnd(u.damageFee)}{Object.keys(u.damageItemFees || {}).length ? ' (' + Object.entries(u.damageItemFees).map(([k, v]) => ((DAMAGE_ITEMS.find((d) => d[0] === k) || [k, k])[1]) + ' ' + vnd(v)).join(', ') + ')' : ''} · {u.damageFeeIssuedByName}</div></>
      : <Badge tone="yellow">Chờ sửa chữa và chốt phí</Badge> },
    { key: 'actions', header: '', className: 'actions', render: (u) => canWork && u.damageStatus === 'REPORTED' &&
      <Button size="sm" onClick={() => open('fee', u, { fees: {} })}><Banknote size={14} /> Chốt phí hư hại</Button> },
  ]

  const titles = {
    assign: 'Gán nhân viên', reschedule: 'Đổi lịch hẹn',
    complete: modal?.appt?.appointmentType === 'CHECK_IN' ? 'Hoàn tất nhận kho' : 'Hoàn tất lịch hẹn',
    return: 'Kiểm tra và nhận trả kho', report: 'Báo khách không đến', fee: 'Chốt phí hư hại',
  }
  const formOpen = !!modal && modal.kind in titles

  return (
    <>
      <PageHeader title="Lịch hẹn"
        subtitle={isStaff ? 'Các lịch hẹn quản lý đã gán cho bạn: cho khách nhận kho, kiểm tra kho khi trả và báo khách không đến.' : isManager ? 'Gán nhân viên và theo dõi mọi lịch hẹn tại cơ sở của bạn.' : 'Tất cả lịch hẹn (chỉ xem).'} />
      <div className="toolbar">
        {canWork && <Select label="Xem" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="today">Hôm nay</option>
          <option value="all">Tất cả lịch hẹn</option>
          {isManager && <option value="noshow">Báo cáo khách không đến cần xử lý</option>}
          <option value="damage">Báo cáo hư hại</option>
        </Select>}
        {isStaff && <Button onClick={() => open('return', null, { hasDamage: false })}><ClipboardCheck size={14} /> Ghi nhận trả kho</Button>}
        {view === 'damage' && (
          <Select label="Trạng thái hư hại" value={damageStatus} onChange={(e) => setDamageStatus(e.target.value)}>
            <option value="REPORTED">Chờ sửa chữa và chốt phí</option>
            <option value="FEE_ISSUED">Đã chốt phí</option>
            <option value="">All</option>
          </Select>)}
        {view !== 'today' && view !== 'damage' && <>
          <Select label="Loại" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Tất cả loại</option>
            {APPOINTMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
          <Select label="Trạng thái" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tất cả trạng thái</option>
            {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Input label="Ngày" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </>}
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> :
        view === 'damage'
          ? <DataTable columns={damageColumns} rows={list.data} rowKey="id"
              empty={<EmptyState title="Chưa có báo cáo hư hại" message="Hư hại phát hiện khi khách trả kho sẽ hiện ở đây." />} />
          : <DataTable columns={columns} rows={list.data} rowKey="id"
          empty={<EmptyState title={view === 'noshow' ? 'Không có báo cáo cần xử lý' : 'Chưa có lịch hẹn'}
            message={view === 'today' ? (isStaff ? 'Hôm nay bạn chưa được gán lịch nào. Các ngày khác xem ở "Tất cả lịch hẹn".' : 'Hôm nay cơ sở của bạn chưa có lịch hẹn nào.') : 'Hãy thử bộ lọc khác.'}
            action={view === 'today' ? <Button variant="secondary" onClick={() => setView('all')}>Xem tất cả lịch hẹn</Button> : null} />} />}

      <FormModal open={formOpen} title={titles[modal?.kind] || ''} onClose={close} onSubmit={submit}
        submitText={{ assign: 'Gán', reschedule: 'Đổi lịch', complete: 'Hoàn tất', return: 'Ghi nhận trả kho', report: 'Gửi báo cáo', fee: 'Xác nhận phí' }[modal?.kind]}>
        {modal?.kind === 'assign' && (
          <div className="span-2">
            <Select label="Nhân viên" required value={form.staffId || ''} onChange={set('staffId')}
              hint={!staffList.loading && !staffOptions.length ? 'Cơ sở này chưa có nhân viên nào được phân công.' : undefined}>
              <option value="">Chọn nhân viên</option>
              {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.fullname}</option>)}
            </Select>
          </div>)}
        {modal?.kind === 'reschedule' && <>
          <Input label="Ngày" type="date" required value={form.date || ''} onChange={set('date')}
            min={new Date().toISOString().slice(0, 10)} max={modal.appt.maxHandoverDate || undefined} />
          <Input label="Giờ" type="time" required value={form.time || ''} onChange={set('time')} />
          <p className="muted small span-2">
            Khách sẽ được thông báo về giờ hẹn mới.
            {modal.appt.maxHandoverDate ? ` Lịch nhận kho chỉ được dời tới tối đa ngày ${fmtDate(modal.appt.maxHandoverDate)}.` : ''}
          </p>
        </>}
        {modal?.kind === 'complete' && <>
          {modal.appt.appointmentType === 'CHECK_IN' && (!modal.appt.unitAssigned || modal.appt.reservationStatus !== 'CONFIRMED') && (
            <div className="form-alert span-2" role="alert">
              Đơn này chưa được gán ô kho (trạng thái: {label(modal.appt.reservationStatus)}).
              Quản lý cơ sở cần vào mục <strong>Đơn thuê &amp; hợp đồng</strong>, gán ô kho cho đơn. Sau đó nhân viên mới cho khách nhận kho được.
            </div>)}
          {modal.appt.appointmentType === 'CHECK_IN' && (
            <div className="span-2">
              <p style={{ margin: 0 }}>
                Cọc (Đợt 1): <strong>{modal.appt.depositPaid ? 'đã đóng' : 'chưa đóng'}</strong> · Tiền thuê (Đợt 2): <strong>{modal.appt.rentalPaid ? 'đã đóng' : 'chưa đóng'}</strong> · Hợp đồng: <strong>{modal.appt.contractSigned ? 'đã ký' : 'chưa ký'}</strong>
              </p>
              {!modal.appt.contractSigned && <p className="muted small" style={{ margin: '8px 0 0' }}>Khách cần ký hợp đồng thuê kho trước khi nhận kho.</p>}
              {!modal.appt.rentalPaid && (
                <div style={{ marginTop: 8 }}>
                  <p className="muted small" style={{ margin: '0 0 8px' }}>Tiền thuê Đợt 2 chưa cần trả trước khi nhận kho (khách trả trong vòng nửa thời gian thuê). Nếu khách muốn trả luôn tại quầy thì bấm thu bên dưới.</p>
                  {modal.appt.pendingRentalPaymentId
                    ? <Button type="button" variant="secondary" size="sm" loading={collecting} onClick={collectRental}><Banknote size={14} /> Đánh dấu đã thu tiền thuê (tiền mặt)</Button>
                    : <p className="muted small" style={{ margin: 0 }}>Hóa đơn tiền thuê được tạo sau khi khách đóng cọc và có ô kho được gán.</p>}
                </div>)}
            </div>)}
          {modal.appt.appointmentType === 'CHECK_IN' && (
            <label className="span-2" style={checkbox}>
              <input type="checkbox" checked={!!form.keyHandedOver} onChange={set('keyHandedOver')} />
              <span>Tôi đã bàn giao chìa khóa ô <strong>{modal.appt.unitCode}</strong> cho khách</span>
            </label>)}
          <div className="span-2"><Textarea label="Ghi chú" maxLength={300} value={form.notes || ''} onChange={set('notes')} /></div>
        </>}
        {modal?.kind === 'return' && <>
          {!modal.appt && (
            <div className="span-2">
              <Select label="Hợp đồng thuê kho đang trả" required value={form.contractId || ''} onChange={set('contractId')}
                hint={!returnable.loading && !returnableContracts.length ? 'Cơ sở của bạn không có hợp đồng đang thuê hoặc quá hạn.' : 'Dành cho khách đến trả kho mà không đặt lịch hẹn.'}>
                <option value="">Chọn hợp đồng</option>
                {returnableContracts.map((c) => <option key={c.id} value={c.id}>#{c.id} · Unit {c.unitCode} · {c.customerName} · ends {fmtDate(c.endDate)}</option>)}
              </Select>
            </div>)}
          <div className="span-2"><Textarea label="Tình trạng ô kho" maxLength={500} value={form.unitCondition || ''} onChange={set('unitCondition')} hint="Mô tả những gì bạn thấy khi kiểm tra ô kho." /></div>
          <label className="span-2" style={checkbox}>
            <input type="checkbox" checked={!!form.hasDamage} onChange={set('hasDamage')} />
            <span>Phát hiện hư hại ở ô kho</span>
          </label>
          {form.hasDamage && <>
            <div className="span-2">
              <p style={{ margin: '0 0 6px' }}><strong>Hư hại ở đâu?</strong> <span className="muted small">(tích tất cả mục đúng)</span></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {DAMAGE_ITEMS.map(([code, text]) => (
                  <label key={code} style={checkbox}>
                    <input type="checkbox" checked={(form.damageItems || []).includes(code)}
                      onChange={(e) => setForm({ ...form, damageItems: e.target.checked ? [...(form.damageItems || []), code] : (form.damageItems || []).filter((x) => x !== code) })} />
                    <span>{text}</span>
                  </label>))}
              </div>
            </div>
            <div className="span-2"><Textarea label={(form.damageItems || []).includes('OTHER') ? 'Mô tả vấn đề khác' : 'Chi tiết thêm (không bắt buộc)'}
              required={(form.damageItems || []).includes('OTHER')} maxLength={500} value={form.damageDescription || ''} onChange={set('damageDescription')}
              hint="Không nhập phí ở đây: quản lý sắp xếp sửa chữa rồi chốt phí hư hại trong mục Báo cáo hư hại." /></div>
          </>}
          <div className="span-2"><Textarea label="Ghi chú" maxLength={500} value={form.notes || ''} onChange={set('notes')} /></div>
        </>}
        {modal?.kind === 'fee' && modal.appt && <>
          <div className="span-2">
            <p style={{ margin: 0 }}>Ô kho <strong>{modal.appt.unitCode}</strong> · {modal.appt.customerName}</p>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              Inspection report by {modal.appt.staffName} on {fmtDateTime(modal.appt.returnedAt)}
            </p>
            {modal.appt.unitCondition && <p className="small" style={{ margin: '6px 0 0' }}><strong>Condition:</strong> {modal.appt.unitCondition}</p>}
            {modal.appt.damageDescription && !reportedKeys(modal.appt).includes('OTHER') && <p className="small" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}><strong>Ghi chú của nhân viên:</strong> {modal.appt.damageDescription}</p>}
          </div>
          <div className="span-2">
            <p style={{ margin: '0 0 6px' }}><strong>Các hạng mục hư hại</strong> <span className="muted small">(nhập phí cho từng hạng mục nhân viên đã báo)</span></p>
            <div style={{ display: 'grid', gap: 6 }}>
              {DAMAGE_ITEMS.map(([code, label]) => {
                const reported = reportedKeys(modal.appt).includes(code)
                return (
                  <div key={code} style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10, alignItems: 'center', opacity: reported ? 1 : 0.45 }}>
                    <span>{reported ? '☑' : '☐'} {label}{!reported && <span className="muted small"> — chưa ghi nhận</span>}
                      {reported && code === 'OTHER' && modal.appt.damageDescription && <span className="small" style={{ display: 'block', marginLeft: 20, whiteSpace: 'pre-wrap' }}>Description: {modal.appt.damageDescription}</span>}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="text" inputMode="numeric" disabled={!reported} placeholder={reported ? 'Fee' : '—'} style={{ width: '100%', textAlign: 'right' }}
                        value={reported && (form.fees || {})[code] ? Number((form.fees || {})[code]).toLocaleString('vi-VN') : ''}
                        onChange={(e) => setForm({ ...form, fees: { ...(form.fees || {}), [code]: e.target.value.replace(/\D/g, '').slice(0, 12) } })} />
                      <span className="muted small">VND</span>
                    </div>
                  </div>)
              })}
            </div>
            <p style={{ margin: '10px 0 0' }}><strong>Total damage fee: {vnd(damageTotal(modal.appt, form.fees))}</strong></p>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Nhập sau khi sửa chữa xong (nhập 0 nếu không thu). Tổng phí được trừ vào tiền cọc hoàn lại của khách trước, chỉ phần vượt quá cọc mới lập hóa đơn riêng.</p>
          </div>
        </>}
        {modal?.kind === 'report' && (
          <div className="span-2"><Textarea label="Chuyện gì đã xảy ra?" required maxLength={250} value={form.note || ''} onChange={set('note')}
            hint="Quản lý cơ sở sẽ liên hệ khách. Trạng thái lịch hẹn không thay đổi." /></div>)}
      </FormModal>

      <ConfirmDialog open={modal?.kind === 'cancel' || modal?.kind === 'noshow'} danger
        title={modal?.kind === 'cancel' ? 'Hủy lịch hẹn' : 'Đánh dấu khách không đến'}
        confirmText={modal?.kind === 'cancel' ? 'Hủy lịch hẹn' : 'Đánh dấu không đến'}
        message={modal?.kind === 'cancel'
          ? `Cancel ${label(modal?.appt?.appointmentType).toLowerCase()} of ${modal?.appt?.customerName} on ${fmtDateTime(modal?.appt?.scheduledAt)}? The customer is notified.`
          : `Mark ${modal?.appt?.customerName} as a no-show for ${fmtDateTime(modal?.appt?.scheduledAt)}? They will need to book again.`}
        onConfirm={confirm} onClose={close} />
    </>
  )
}

import { useEffect, useState } from 'react'
import { unitTypeLabel, fmtDate } from '../utils/format.js'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, QrCode, MapPin, Ruler, CalendarCheck, Building2, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'
import CancellationPolicyItems, { useCancellationPolicy } from '../components/CancellationPolicy.jsx'
import BankQrPay from '../components/BankQrPay.jsx'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
  { value: 'CASH', text: 'Chưa thanh toán ngay (Giữ đơn chưa thanh toán trong thời hạn quy định)' },
]
// Giờ nhận kho: 09:00 - 17:00, mỗi 30 phút.
const PICKUP_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const mins = 9 * 60 + i * 30
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
})
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => localIso(new Date())
const maxStartIso = (months = 1) => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return localIso(d)
}

/** Quy đổi price rule về số tiền: RENTAL -> mỗi tháng. */
function amountOf(rule, monthly) {
  if (!rule) return null
  if (rule.calculationType === 'PERCENTAGE') return monthly != null ? Math.round((monthly * Number(rule.percentage)) / 100) : null
  if (rule.calculationType === 'PER_DAY') return Number(rule.amount) * 30
  return Number(rule.amount)
}

export default function Checkout() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const initialFacilityId = Number(params.get('facility')) || ''
  const initialUnitTypeId = Number(params.get('unitType')) || ''
  const selectedUnitCode = params.get('unitCode') || ''

  const [selectedFacilityId, setSelectedFacilityId] = useState(initialFacilityId)
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState(initialUnitTypeId)

  useEffect(() => {
    if (!selectedFacilityId && facilities.data?.length) {
      setSelectedFacilityId(facilities.data[0].id)
    }
  }, [facilities.data, selectedFacilityId])

  const facilityId = Number(selectedFacilityId) || 0
  const unitTypes = useAsync(
    () => (facilityId ? api.unitTypes.listByFacility(facilityId) : Promise.resolve([])),
    [facilityId]
  )

  useEffect(() => {
    if (unitTypes.data?.length) {
      const activeTypes = unitTypes.data.filter((t) => t.active)
      if (!selectedUnitTypeId || !activeTypes.some((t) => t.id === Number(selectedUnitTypeId))) {
        const firstId = activeTypes[0]?.id || ''
        setSelectedUnitTypeId(firstId)
      }
    }
  }, [unitTypes.data, selectedUnitTypeId])

  const unitTypeId = Number(selectedUnitTypeId) || 0

  const { data, loading, error, reload } = useAsync(async () => {
    if (!facilityId || !unitTypeId) return null
    const [facility, types, units, rent, dep] = await Promise.all([
      api.facilities.get(facilityId),
      api.unitTypes.listByFacility(facilityId),
      api.storageUnits.search({ facilityId, unitTypeId, status: 'AVAILABLE' }),
      api.priceRules.current({ priceType: 'RENTAL', facilityId, unitTypeId }).catch(() => null),
      api.priceRules.current({ priceType: 'DEPOSIT', facilityId, unitTypeId }).catch(() => null),
    ])
    const unitType = types.find((t) => t.id === unitTypeId)
    const monthly = amountOf(rent, null) ?? 1000000
    return { facility, unitType, units, monthly, depRule: dep }
  }, [facilityId, unitTypeId])

  const [months, setMonths] = useState(1)
  // Báo giá do backend tính (giá niêm yết, giảm giá, tổng, cọc) để số hiển thị luôn khớp số phải trả.
  const quote = useAsync(
    () => (facilityId && unitTypeId ? api.reservations.quote({ facilityId, unitTypeId, months }).catch(() => null) : Promise.resolve(null)),
    [facilityId, unitTypeId, months],
  ).data
  const [startDate, setStartDate] = useState(todayIso())
  const [pickupTime, setPickupTime] = useState('09:00')
  const [qrStep, setQrStep] = useState(null) // { reservation, payment } khi đang chờ khách quét QR đặt cọc
  const [payStageMode, setPayStageMode] = useState('STAGE1_DEPOSIT') // STAGE1_DEPOSIT | NOT_PAID_24H
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [transferRef, setTransferRef] = useState('')
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)
  const pickupMinutes = 30 // mỗi lượt nhận kho giữ 1 khung 30 phút của nhân viên
  const [slot, setSlot] = useState(null) // kết quả kiểm tra khung giờ: { capacity, booked, full, message }
  const [warning, setWarning] = useState('') // cảnh báo đã 2 lần đặt kho không thanh toán, cần khách xác nhận
  const [ack, setAck] = useState(false)
  const policy = useCancellationPolicy()

  // Kiểm tra khung giờ nhận kho đã đủ nhân viên tiếp nhận chưa.
  useEffect(() => {
    if (!facilityId || !startDate || !pickupTime) { setSlot(null); return undefined }
    let alive = true
    api.appointments.slotCheck({ facilityId, date: startDate, time: pickupTime, minutes: pickupMinutes })
      .then((s) => { if (alive) setSlot(s) }).catch(() => { if (alive) setSlot(null) })
    return () => { alive = false }
  }, [facilityId, startDate, pickupTime, pickupMinutes])

  const back = (
    <Link to={facilityId ? `/storage-options?facility=${facilityId}` : '/storage-options'}>
      <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Quay lại danh sách kho
    </Link>
  )

  if (facilities.loading || loading) {
    return <section className="section"><div className="container"><LoadingState /></div></section>
  }
  if (facilities.error || error) {
    return <section className="section"><div className="container"><ErrorState error={facilities.error || error} onRetry={reload} /></div></section>
  }
  if (!facilities.data?.length) {
    return (
      <section className="section">
        <div className="container">
          <EmptyState title="Chưa có cơ sở nào đang hoạt động" message="Hiện chưa có cơ sở kho nào để đặt." />
        </div>
      </section>
    )
  }

  const facility = data?.facility
  const unitType = data?.unitType
  const units = data?.units || []
  const monthly = quote ? Number(quote.monthlyPrice) : (data?.monthly ?? 1000000)
  const discount = quote ? Number(quote.discountAmount) : 0
  const stage2FullRental = quote ? Number(quote.total) : monthly * months
  // Đợt 1: tiền cọc theo PriceRule DEPOSIT (cố định hoặc %); chưa có rule thì backend thu mặc định 50% tổng tiền thuê.
  const depPct = data?.depRule?.calculationType === 'PERCENTAGE' && data.depRule.percentage != null ? Number(data.depRule.percentage) : 50
  const stage1Deposit = quote ? Math.round(Number(quote.depositAmount)) : Math.round(stage2FullRental * depPct / 100)
  const depositNote = `${depPct}% tổng tiền thuê`
  const totalBothStages = stage1Deposit + stage2FullRental
  const canSubmit = !!facility && !!unitType && units.length > 0
  const dims = unitType ? [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ') : ''
  const goToReservation = () => navigate(`/account/reservations/${qrStep.reservation.id}`, { replace: true })

  if (qrStep) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: 760 }}>
          <PageHeader
            title={`Đơn đặt kho #${qrStep.reservation.id} đã được tạo`}
            subtitle={`Vui lòng ${qrStep.full ? 'thanh toán toàn bộ' : 'đóng cọc Đợt 1'} (${money(qrStep.payment.amount)}) trong vòng ${policy.unpaidHoldHours} giờ để giữ kho. Quét mã QR bên dưới, tiền vào tài khoản là đơn được ghi nhận ngay.`}
          />
          <BankQrPay
            payment={qrStep.payment}
            onPaid={() => {
              toast(`${qrStep.full ? 'Đã nhận đủ tiền cọc và tiền thuê.' : 'Đã nhận cọc Đợt 1.'} Quý khách vui lòng điền thông tin hồ sơ hợp đồng ở mục Hợp đồng của tôi (hoặc gặp nhân viên tại cơ sở để ký trực tiếp).`)
              goToReservation()
            }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={goToReservation}>Thanh toán sau (còn {policy.unpaidHoldHours} giờ)</Button>
            {/* Nút thử nghiệm trong lúc chưa dùng ngân hàng thật; sẽ bỏ khi chạy thật. */}
            <Button
              variant="secondary"
              onClick={async () => {
                await api.payments.simulateGateway(qrStep.payment.id, { paymentMethod: 'BANK_TRANSFER', full: qrStep.full ? true : undefined })
                goToReservation()
              }}
            >
              [Demo] Giả lập đã thanh toán
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const submitReservation = async (e, acknowledged = false) => {
    e?.preventDefault?.()
    setError2('')
    if (startDate < todayIso() || startDate > maxStartIso(policy.maxStartMonths)) {
      setError2(`Ngày bắt đầu nhận kho phải từ hôm nay (${fmtDate(todayIso())}) và không quá ${policy.maxStartMonths} tháng kể từ ngày đặt cọc (${fmtDate(maxStartIso(policy.maxStartMonths))}).`)
      return
    }
    setPaying(true)
    try {
      const reservation = await api.reservations.create({
        facilityId: Number(facilityId),
        unitTypeId: Number(unitTypeId),
        startDate,
        rentalMonths: Number(months),
        pickupTime,
        pickupDurationMinutes: Number(pickupMinutes),
        acknowledgedWarning: acknowledged || undefined,
      })

      if ((payStageMode === 'STAGE1_DEPOSIT' || payStageMode === 'FULL_PAYMENT') && method !== 'CASH') {
        const depositPay = await api.payments.get(reservation.pendingDepositPaymentId)
        const full = payStageMode === 'FULL_PAYMENT'
        // Trả trọn gói: một mã QR cho tổng cọc + tiền thuê, nội dung vẫn là mã khoản cọc.
        setQrStep({ reservation, full, payment: full ? { ...depositPay, amount: Number(depositPay.amount) + Number(reservation.estimatedAmount) } : depositPay })
        setPaying(false)
        return
      }
      toast(`Đã tạo đơn, chưa thanh toán. Quý khách có ${policy.unpaidHoldHours} giờ kể từ lúc đặt để đóng cọc Đợt 1, nếu không đơn sẽ tự hủy.`)
      navigate(`/account/reservations/${reservation.id}`, { replace: true })
    } catch (err) {
      const msg = err.message || 'Đặt kho thất bại'
      if (msg.startsWith('STREAK_WARNING:')) {
        setWarning(msg.replace('STREAK_WARNING:', ''))
        setAck(false)
      } else if (msg.startsWith('SLOT_FULL:')) {
        setError2(msg.replace('SLOT_FULL:', ''))
        setSlot((s) => ({ ...(s || {}), full: true, message: msg.replace('SLOT_FULL:', '') }))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        setError2(msg)
      }
      setPaying(false)
    }
  }

  return (
    <section className="section">
      {warning && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)', borderRadius: 16, maxWidth: 540, width: '100%', padding: 24 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#b91c1c', fontWeight: 800, fontSize: 18 }}>
              <ShieldAlert size={22} /> Cảnh báo quan trọng
            </div>
            <p style={{ marginTop: 10 }}>{warning}</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginTop: 8 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 4 }} />
              <span>Tôi đã đọc và chấp nhận chịu trách nhiệm về hành vi của mình nếu tiếp tục đặt kho mà không thanh toán.</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setWarning('')}>Hủy, không đặt nữa</Button>
              <Button disabled={!ack} onClick={() => { setWarning(''); submitReservation(null, true) }}>Đồng ý và tiếp tục</Button>
            </div>
          </div>
        </div>
      )}
      <div className="container">
        <PageHeader
          eyebrow={back}
          title="Đặt thuê kho"
          subtitle={`Chọn cơ sở, loại kho, ngày bắt đầu nhận kho (tối đa ${policy.maxStartMonths} tháng từ ngày cọc) và thanh toán Đợt 1 (tiền cọc giữ kho).`}
        />
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <form onSubmit={submitReservation}>
            <Card>
              <h3 style={{ marginBottom: 16 }}>1. Thông tin đặt thuê kho</h3>
              {selectedUnitCode && (
                <div style={{
                  background: 'rgba(245, 197, 66, 0.1)',
                  border: '1px solid #F5C542',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <Building2 size={20} color="#F5C542" />
                  <div>
                    <strong style={{ color: '#F5C542' }}>Quý khách đang quan tâm ô kho: {selectedUnitCode}</strong>
                    <div style={{ fontSize: 13, color: '#9CA3AF' }}>Sau khi quý khách đóng cọc, quản lý cơ sở sẽ gán ô kho phù hợp cho đơn (ưu tiên ô quý khách đã chọn nếu còn trống).</div>
                  </div>
                </div>
              )}
              <div className="form-grid">
                <Select
                  label="Cơ sở kho"
                  value={selectedFacilityId}
                  onChange={(e) => {
                    const nextFac = Number(e.target.value)
                    setSelectedFacilityId(nextFac)
                    setSelectedUnitTypeId('')
                    setParams({ facility: nextFac })
                  }}
                >
                  {facilities.data.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
                <Select
                  label="Loại kho"
                  value={selectedUnitTypeId}
                  onChange={(e) => {
                    const nextType = Number(e.target.value)
                    setSelectedUnitTypeId(nextType)
                    setParams({ facility: facilityId, unitType: nextType })
                  }}
                >
                  {(unitTypes.data || []).filter((t) => t.active).map((t) => (
                    <option key={t.id} value={t.id}>{unitTypeLabel(t.typeName)}</option>
                  ))}
                </Select>
                <Select label="Thời hạn thuê" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {Array.from({ length: policy.maxBookingMonths }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m} tháng</option>
                  ))}
                </Select>
                <Input
                  label={`Ngày bắt đầu nhận kho (tối đa ${policy.maxStartMonths} tháng từ hôm nay)`}
                  type="date"
                  required
                  min={todayIso()}
                  max={maxStartIso(policy.maxStartMonths)}
                  hint={`Từ ${fmtDate(todayIso())} đến tối đa ${fmtDate(maxStartIso(policy.maxStartMonths))}`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Select label="Giờ hẹn nhận kho (09:00 - 17:00)" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                  {PICKUP_SLOTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                {slot?.full && (
                  <div className="span-2" role="alert" style={{ border: '1.5px solid #b91c1c', background: 'rgba(185,28,28,.08)', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontWeight: 600 }}>
                    {slot.message || 'Khung giờ này đã kín lịch nhân viên tiếp nhận. Vui lòng chọn giờ khác (sớm hơn hoặc muộn hơn).'}
                  </div>
                )}
              </div>

              <h3 style={{ margin: '28px 0 16px' }}>2. Thanh toán Đợt 1 — Đặt cọc giữ kho ({money(stage1Deposit)})</h3>
              <div className="form-grid">
                <div className="span-2">
                  <Select
                    label="Trạng thái thanh toán Đợt 1"
                    value={payStageMode}
                    onChange={(e) => setPayStageMode(e.target.value)}
                  >
                    <option value="STAGE1_DEPOSIT">Thanh toán Đợt 1 (Cọc {money(stage1Deposit)}) ngay bây giờ</option>
                    <option value="FULL_PAYMENT">Thanh toán toàn bộ (Cọc + Tiền thuê = {money(totalBothStages)}) ngay bây giờ</option>
                    <option value="NOT_PAID_24H">Đặt giữ đơn trước — Chưa thanh toán (giữ đơn {policy.unpaidHoldHours} giờ)</option>
                  </Select>
                </div>

                {(payStageMode === 'STAGE1_DEPOSIT' || payStageMode === 'FULL_PAYMENT') && (
                  <>
                    <div className="span-2">
                      <Select label="Cổng thanh toán nội địa / Ngân hàng" value={method} onChange={(e) => setMethod(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.text}</option>
                        ))}
                      </Select>
                    </div>

                    <p className="span-2 muted">
                      Sau khi bấm đặt kho, hệ thống hiện <strong>mã QR chuyển khoản</strong> đã điền sẵn số tiền và nội dung.
                      Quý khách chỉ cần quét mã và chuyển tiền, đơn sẽ tự động ghi nhận {payStageMode === 'FULL_PAYMENT' ? 'đã thanh toán đủ cả cọc và tiền thuê' : 'đã đặt cọc'}.
                    </p>
                  </>
                )}

                {(payStageMode === 'NOT_PAID_24H' || method === 'CASH') && (
                  <p className="span-2 muted">
                    Đơn sẽ được tạo ở trạng thái <strong>chưa thanh toán</strong> và giữ hạn thanh toán trong vòng <strong>{policy.unpaidHoldHours} giờ</strong> kể từ lúc bấm đặt.
                  </p>
                )}
              </div>

              {error2 && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error2}</div>}
              {!canSubmit && (
                <div className="form-alert" role="alert" style={{ marginTop: 16 }}>
                  Loại kho này hiện đã hết ô trống tại cơ sở đang chọn.{' '}
                  <Link to="/storage-options" style={{ textDecoration: 'underline' }}>Chọn loại kho khác</Link>
                </div>
              )}

              <Button type="submit" size="lg" loading={paying} disabled={!canSubmit} style={{ marginTop: 24, width: '100%' }}>
                {payStageMode === 'FULL_PAYMENT' && method !== 'CASH' ? (
                  <><QrCode size={18} /> Thanh toán toàn bộ ({money(totalBothStages)}) & Đặt kho</>
                ) : payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? (
                  <><QrCode size={18} /> Thanh toán Đợt 1 ({money(stage1Deposit)}) & Đặt kho</>
                ) : (
                  <><CalendarCheck size={18} /> Đặt kho (giữ đơn {policy.unpaidHoldHours} giờ, chưa thanh toán)</>
                )}
              </Button>
            </Card>
          </form>

          {unitType && facility && (
            <Card className="loc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>{unitTypeLabel(unitType.typeName)}</h3>
                <Badge tone={units.length ? 'green' : 'neutral'}>
                  {units.length ? `Còn ${units.length} ô trống` : 'Hết kho trống'}
                </Badge>
              </div>
              <div className="meta"><MapPin size={18} /><span>{facility.name} · {facility.address}</span></div>
              {(unitType.sizeDescription || dims) && (
                <div className="meta"><Ruler size={18} /><span>{unitType.sizeDescription || `${dims} m`}</span></div>
              )}
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>Đợt 1:</strong> Tiền đặt cọc giữ kho ({depositNote})</span>
                <strong>{money(stage1Deposit)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>Đợt 2:</strong> Tiền thuê kho, trả trong vòng {months * 15} ngày kể từ ngày bắt đầu thuê ({months} tháng × {money(monthly)}{discount > 0 ? `, đã giảm ${money(discount)}` : ''})</span>
                <strong>{money(stage2FullRental)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                <span>Tổng cộng Đợt 1 + Đợt 2 (Hoàn lại cọc khi hết hạn HĐ)</span>
                <strong>{money(totalBothStages)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, color: 'var(--primary, #2563eb)' }}>
                <span>Cần thanh toán ngay (Đợt 1)</span>
                <span>{payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? money(stage1Deposit) : `${money(0)} (chưa thanh toán, hạn ${policy.unpaidHoldHours} giờ)`}</span>
              </div>

              <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                  <ShieldAlert size={16} /> Quy định Nhận kho & Hoàn tiền cọc:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                  <li><strong>Hạn thanh toán Đợt 1:</strong> Trong vòng <strong>{policy.unpaidHoldHours} giờ</strong> kể từ khi bấm đặt (quá hạn đơn sẽ tự hủy).</li>
                  <li><strong>Hạn đóng Đợt 2:</strong> không cần trả trước khi nhận kho, nhưng phải trả đủ trong vòng <strong>nửa thời gian thuê</strong> ({months * 15} ngày với {months} tháng) kể từ ngày bắt đầu thuê. Trễ hạn bị tính phí mỗi ngày; trễ quá <strong>{policy.stage2GraceDays} ngày</strong> hợp đồng bị hủy và ô kho bị thu hồi (cọc xử lý theo chính sách hủy).</li>
                  <li><strong>Ngày nhận kho:</strong> tối đa <strong>{policy.maxStartMonths} tháng</strong> kể từ hôm nay (hạn chót: <strong>{fmtDate(maxStartIso(policy.maxStartMonths))}</strong>).</li>
                  <CancellationPolicyItems policy={policy} deposit={stage1Deposit} />
                  <li><strong>Nhận kho:</strong> Tiền cọc được giữ đến khi kết thúc hợp đồng, hoàn lại sau khi trừ các khoản phí phát sinh (quá hạn, hư hại) nếu có.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}

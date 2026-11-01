import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, QrCode, MapPin, Ruler, CalendarCheck, Building2, Check } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { canBook } from '../utils/facility.js'
import { money } from '../utils/format.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
  { value: 'CASH', text: 'Thanh toán tiền mặt tại quầy kho' },
]
const MONTHS = [1, 2, 3, 6, 12]
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Quy đổi price rule về số tiền: RENTAL -> mỗi tháng, DEPOSIT -> một lần. */
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
    const deposit = amountOf(dep, monthly) ?? Math.round(monthly * 0.5)
    return { facility, unitType, units, monthly, deposit }
  }, [facilityId, unitTypeId])

  const [months, setMonths] = useState(1)
  const [startDate, setStartDate] = useState(todayIso())
  const [payDepositNow, setPayDepositNow] = useState(true)
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [transferRef, setTransferRef] = useState('')
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)

  const back = (
    <Link to={facilityId ? `/storage-options?facility=${facilityId}` : '/storage-options'}>
      <ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to storage options
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
          <EmptyState title="No active facilities" message="No storage facilities are available right now." />
        </div>
      </section>
    )
  }

  const facility = data?.facility
  const unitType = data?.unitType
  const units = data?.units || []
  const monthly = data?.monthly ?? 1000000
  const deposit = data?.deposit ?? Math.round(monthly * 0.5)
  const rentEstimate = monthly * months
  const canSubmit = !!facility && !!unitType && units.length > 0 && canBook(facility)
  const dims = unitType ? [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ') : ''
  const qrMemo = `COC ${unitType?.typeName || 'KHO'} FAC${facilityId}`
  const vietQrUrl = `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${deposit}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`

  const submitReservation = async (e) => {
    e.preventDefault()
    setError2('')
    setPaying(true)
    try {
      // 1. Tạo Reservation trên Backend (kiểm tra kho trống và tự tạo hóa đơn cọc PENDING)
      const reservation = await api.reservations.create({
        facilityId: Number(facilityId),
        unitTypeId: Number(unitTypeId),
        startDate,
        rentalMonths: Number(months),
      })

      // 2. Nếu khách chọn thanh toán cọc online ngay (VietQR / VNPay / MoMo)
      if (payDepositNow && method !== 'CASH') {
        const depositId = reservation.pendingDepositPaymentId
          || (await api.payments.create({
            reservationId: reservation.id,
            paymentType: 'DEPOSIT',
            paymentMethod: method,
            transactionReference: transferRef || `${method}-RSV-${reservation.id}`,
          })).id
        await api.payments.markPaid(depositId, {
          paymentMethod: method,
          transactionReference: transferRef || `${method}-RSV-${reservation.id}`,
        })
        toast('Đặt chỗ và thanh toán tiền cọc thành công! Quản lý cơ sở sẽ gán ô kho cho bạn.')
      } else {
        toast('Đã gửi yêu cầu đặt kho! Hóa đơn tiền cọc đang ở trạng thái chờ thanh toán (PENDING).')
      }

      navigate(`/account/reservations/${reservation.id}`, { replace: true })
    } catch (err) {
      setError2(err.message || 'Booking failed')
      setPaying(false)
    }
  }

  return (
    <section className="section">
      <div className="container">
        <PageHeader
          eyebrow={back}
          title="Reserve a Storage Unit"
          subtitle="Select your facility, unit size, rental period, and online banking / QR payment method."
        />
        <ol className="stepper" aria-label="Booking steps">
          <li className="done"><span className="dot"><Check size={16} /></span> Choose a unit</li>
          <span className="bar" aria-hidden="true" />
          <li className="current" aria-current="step"><span className="dot">2</span> Reserve and pay deposit</li>
          <span className="bar" aria-hidden="true" />
          <li><span className="dot">3</span> Unit confirmed</li>
        </ol>
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <form onSubmit={submitReservation}>
            <Card>
              <h3 style={{ marginBottom: 16 }}>1. Thông tin đặt thuê kho (Reservation)</h3>
              <div className="form-grid">
                <Select
                  label="Cơ sở kho (Facility)"
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
                  label="Loại kích thước kho (Unit Type)"
                  value={selectedUnitTypeId}
                  onChange={(e) => {
                    const nextType = Number(e.target.value)
                    setSelectedUnitTypeId(nextType)
                    setParams({ facility: facilityId, unitType: nextType })
                  }}
                >
                  {(unitTypes.data || []).filter((t) => t.active).map((t) => (
                    <option key={t.id} value={t.id}>{t.typeName}</option>
                  ))}
                </Select>
                <Select label="Thời hạn thuê (Rental Months)" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m} tháng ({m} month{m > 1 ? 's' : ''})</option>
                  ))}
                </Select>
                <Input
                  label="Ngày bắt đầu nhận kho (Start Date)"
                  type="date"
                  required
                  min={todayIso()}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <h3 style={{ margin: '28px 0 16px' }}>2. Phương thức thanh toán tiền cọc ({money(deposit)})</h3>
              <div className="form-grid">
                <div className="span-2">
                  <Select
                    label="Thời điểm đóng tiền cọc"
                    value={payDepositNow ? 'NOW' : 'LATER'}
                    onChange={(e) => setPayDepositNow(e.target.value === 'NOW')}
                  >
                    <option value="NOW">Thanh toán cọc online ngay ({money(deposit)})</option>
                    <option value="LATER">Gửi đơn đặt chỗ trước, đóng cọc sau khi Quản lý gán kho</option>
                  </Select>
                </div>

                {payDepositNow && (
                  <>
                    <div className="span-2">
                      <Select label="Cổng thanh toán nội địa / Ngân hàng" value={method} onChange={(e) => setMethod(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.text}</option>
                        ))}
                      </Select>
                    </div>

                    {method !== 'CASH' && (
                      <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                          <img
                            src={vietQrUrl}
                            alt="VietQR Payment"
                            style={{ width: 150, height: 150, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 6, border: '1px solid var(--border)' }}
                          />
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                              <Building2 size={16} /> Quét mã QR Ngân hàng / {method}
                            </div>
                            <div className="small muted">Ngân hàng: <strong>MB Bank (Ngân hàng Quân Đội)</strong></div>
                            <div className="small muted">Chủ tài khoản: <strong>SAFESPACE STORAGE</strong></div>
                            <div className="small muted">Số tiền cọc: <strong>{money(deposit)}</strong></div>
                            <div className="small muted">Nội dung CK: <strong>{qrMemo}</strong></div>
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Input
                            label="Mã giao dịch chuyển khoản / Ghi chú xác nhận (tùy chọn)"
                            placeholder="VD: FT26305123456"
                            autoComplete="off"
                            value={transferRef}
                            onChange={(e) => setTransferRef(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {method === 'CASH' && (
                      <p className="span-2 muted">
                        Đơn đặt kho sẽ được tạo kèm phiếu thu tiền cọc ở trạng thái <strong>PENDING</strong> để nhân viên xác nhận khi bạn đóng tại quầy.
                      </p>
                    )}
                  </>
                )}
              </div>

              {error2 && <div className="form-alert" role="alert" style={{ marginTop: 16 }}>{error2}</div>}
              {!canSubmit && (
                <div className="form-alert" role="alert" style={{ marginTop: 16 }}>
                  {facility && !canBook(facility)
                    ? 'Cơ sở này hiện chưa nhận đặt kho.'
                    : 'Loại kho này hiện đã hết ô trống tại cơ sở đang chọn.'}{' '}
                  <Link to="/storage-options" style={{ textDecoration: 'underline' }}>Chọn loại kho khác</Link>
                </div>
              )}

              <Button type="submit" size="lg" loading={paying} disabled={!canSubmit} style={{ marginTop: 24, width: '100%' }}>
                {payDepositNow && method !== 'CASH' ? (
                  <><QrCode size={18} /> Xác nhận đã chuyển khoản cọc & Đặt kho ({money(deposit)})</>
                ) : (
                  <><CalendarCheck size={18} /> Gửi đơn đặt kho (Submit Reservation)</>
                )}
              </Button>
            </Card>
          </form>

          {unitType && facility && (
            <Card className="loc-card summary-sticky">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>{unitType.typeName}</h3>
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
                <span>Tiền thuê dự kiến ({months} tháng × {money(monthly)})</span>
                <span>{money(rentEstimate)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tiền đặt cọc giữ kho (Deposit)</span>
                <strong>{money(deposit)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 18 }}>
                <span>Thanh toán ngay (Cọc)</span>
                <span>{payDepositNow && method !== 'CASH' ? money(deposit) : money(0)}</span>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Quy trình thuê kho: <strong>1. Đặt chỗ (Reservation)</strong> → <strong>2. Quản lý gán ô kho & Đóng cọc</strong> → <strong>3. Sinh Hợp đồng (Rental Contract - PENDING)</strong> → <strong>4. Hẹn lịch Check-in nhận chìa khóa (ACTIVE)</strong>.
              </p>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}

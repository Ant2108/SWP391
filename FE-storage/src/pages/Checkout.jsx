import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, QrCode, MapPin, Ruler, CalendarCheck, Building2, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Badge, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { useToast } from '../hooks/useToast.jsx'
import { api } from '../api/client.js'
import { money } from '../utils/format.js'

const METHODS = [
  { value: 'BANK_TRANSFER', text: 'Chuyển khoản Ngân hàng 24/7 (VietQR)' },
  { value: 'VNPAY', text: 'Cổng thanh toán VNPay QR' },
  { value: 'MOMO', text: 'Ví điện tử MoMo' },
  { value: 'CASH', text: 'Chưa thanh toán ngay (Giữ đơn NOT_PAID trong 24h)' },
]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const todayIso = () => new Date().toISOString().slice(0, 10)
const maxStartIso = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
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
  const [startDate, setStartDate] = useState(todayIso())
  const [payStageMode, setPayStageMode] = useState('STAGE1_DEPOSIT') // STAGE1_DEPOSIT | NOT_PAID_24H
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [transferRef, setTransferRef] = useState('')
  const [error2, setError2] = useState('')
  const [paying, setPaying] = useState(false)

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
          <EmptyState title="No active facilities" message="No storage facilities are available right now." />
        </div>
      </section>
    )
  }

  const facility = data?.facility
  const unitType = data?.unitType
  const units = data?.units || []
  const monthly = data?.monthly ?? 1000000
  const stage2FullRental = monthly * months
  // Đợt 1: tiền cọc theo PriceRule DEPOSIT (cố định hoặc %); chưa có rule thì backend thu mặc định 50% tổng tiền thuê.
  const stage1Deposit = amountOf(data?.depRule, stage2FullRental) ?? Math.round(stage2FullRental * 0.5)
  const depRule = data?.depRule
  const depositNote = !depRule
    ? '50% tổng tiền thuê'
    : depRule.calculationType === 'PERCENTAGE' && depRule.percentage != null
      ? `${Number(depRule.percentage)}% tổng tiền thuê`
      : 'mức cố định theo bảng giá'
  const totalBothStages = stage1Deposit + stage2FullRental
  const canSubmit = !!facility && !!unitType && units.length > 0
  const dims = unitType ? [unitType.width, unitType.length, unitType.height].filter((v) => v != null).join(' × ') : ''
  const qrMemo = `COC DOT1 ${unitType?.typeName || 'KHO'} FAC${facilityId}`
  const vietQrUrl = `https://img.vietqr.io/image/MB-0901000001-compact2.png?amount=${stage1Deposit}&addInfo=${encodeURIComponent(qrMemo)}&accountName=${encodeURIComponent('SAFESPACE STORAGE')}`

  const submitReservation = async (e) => {
    e.preventDefault()
    setError2('')
    if (startDate < todayIso() || startDate > maxStartIso()) {
      setError2(`Ngày bắt đầu nhận kho phải từ hôm nay (${todayIso()}) và không quá 1 tháng kể từ ngày đặt cọc (${maxStartIso()}).`)
      return
    }
    setPaying(true)
    try {
      const reservation = await api.reservations.create({
        facilityId: Number(facilityId),
        unitTypeId: Number(unitTypeId),
        startDate,
        rentalMonths: Number(months),
      })

      if (payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH') {
        const refCode = transferRef || `${method}-DOT1-${reservation.id}`
        const createdPay = await api.payments.create({
          reservationId: reservation.id,
          paymentType: 'DEPOSIT',
          paymentMethod: method,
          transactionReference: refCode,
          paid: false,
        })
        await api.payments.simulateGateway(createdPay.id, {
          paymentMethod: method,
          transactionReference: refCode,
        })
        toast(`Đã thanh toán thành công Đợt 1 (cọc ${money(stage1Deposit)})! Hợp đồng thuê kho đã sẵn sàng để bạn ký điện tử.`)
      } else {
        toast('Đã tạo đơn ở trạng thái NOT_PAID! Bạn có 24 giờ kể từ lúc đặt để hoàn tất thanh toán cọc Đợt 1.')
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
          title="Reserve / Rent a Storage Unit"
          subtitle="Chọn cơ sở, loại kho, ngày bắt đầu nhận kho (tối đa 1 tháng từ ngày cọc) và thanh toán Đợt 1 (tiền cọc giữ kho)."
        />
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
                  label="Ngày bắt đầu nhận kho (Tối đa 1 tháng từ hôm nay)"
                  type="date"
                  required
                  min={todayIso()}
                  max={maxStartIso()}
                  hint={`Từ ${todayIso()} đến tối đa ${maxStartIso()}`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
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
                    <option value="NOT_PAID_24H">Đặt giữ đơn trước — Chưa thanh toán (Trạng thái NOT_PAID, hạn 24h)</option>
                  </Select>
                </div>

                {payStageMode === 'STAGE1_DEPOSIT' && (
                  <>
                    <div className="span-2">
                      <Select label="Cổng thanh toán nội địa / Ngân hàng" value={method} onChange={(e) => setMethod(e.target.value)}>
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.text}</option>
                        ))}
                      </Select>
                    </div>

                    {method !== 'CASH' && (
                      <div className="span-2" style={{ background: 'var(--bg-soft, #f8fafc)', padding: 20, borderRadius: 14, border: '2px solid #cbd5e1' }}>
                        <div style={{ display: 'flex', gap: 22, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'center', background: '#fff', padding: 12, borderRadius: 12, border: '2px solid #f9b800', boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
                            <img
                              src={vietQrUrl}
                              alt="VietQR Payment"
                              style={{ width: 280, height: 280, objectFit: 'contain', margin: '0 auto' }}
                            />
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 6 }}>
                              QUÉT MÃ VIETQR ĐỂ ĐẶT CỌC ĐỢT 1
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 210 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
                              <Building2 size={18} /> Thông tin chuyển khoản ({method})
                            </div>
                            <div style={{ fontSize: 15, marginBottom: 4 }}>Ngân hàng: <strong>MB Bank (Ngân hàng Quân Đội)</strong></div>
                            <div style={{ fontSize: 15, marginBottom: 4 }}>Số tài khoản: <strong>0901000001</strong></div>
                            <div style={{ fontSize: 15, marginBottom: 4 }}>Chủ tài khoản: <strong>SAFESPACE STORAGE</strong></div>
                            <div style={{ fontSize: 16, marginBottom: 4, color: '#b91c1c' }}>Tiền cọc Đợt 1: <strong>{money(stage1Deposit)}</strong></div>
                            <div style={{ fontSize: 15, marginBottom: 12 }}>Nội dung CK: <strong>{qrMemo}</strong></div>
                            <Input
                              label="Mã giao dịch chuyển khoản (tùy chọn)"
                              placeholder="VD: FT26305123456"
                              autoComplete="off"
                              value={transferRef}
                              onChange={(e) => setTransferRef(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {(payStageMode === 'NOT_PAID_24H' || method === 'CASH') && (
                  <p className="span-2 muted">
                    Đơn sẽ được tạo ở trạng thái <strong>NOT_PAID (Chưa thanh toán)</strong> và giữ hạn thanh toán trong vòng <strong>24 giờ</strong> kể từ lúc bấm đặt.
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
                {payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? (
                  <><QrCode size={18} /> Thanh toán Đợt 1 ({money(stage1Deposit)}) & Đặt kho</>
                ) : (
                  <><CalendarCheck size={18} /> Đặt kho (Trạng thái NOT_PAID - Hạn 24h)</>
                )}
              </Button>
            </Card>
          </form>

          {unitType && facility && (
            <Card className="loc-card">
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
                <span><strong>Đợt 1:</strong> Tiền đặt cọc giữ kho ({depositNote})</span>
                <strong>{money(stage1Deposit)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>Đợt 2:</strong> Tiền thuê kho khi nhận ({months} tháng × {money(monthly)})</span>
                <strong>{money(stage2FullRental)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                <span>Tổng cộng Đợt 1 + Đợt 2 (Hoàn lại cọc khi hết hạn HĐ)</span>
                <strong>{money(totalBothStages)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, color: 'var(--primary, #2563eb)' }}>
                <span>Cần thanh toán ngay (Đợt 1)</span>
                <span>{payStageMode === 'STAGE1_DEPOSIT' && method !== 'CASH' ? money(stage1Deposit) : `${money(0)} (NOT_PAID - Hạn 24h)`}</span>
              </div>

              <div style={{ background: 'var(--bg-soft, #f8fafc)', padding: 12, borderRadius: 10, marginTop: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                  <ShieldAlert size={16} /> Quy định Nhận kho & Hoàn tiền cọc:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                  <li><strong>Hạn thanh toán Đợt 1:</strong> Trong vòng <strong>24 giờ</strong> kể từ khi bấm đặt (nếu chưa thanh toán sẽ hiện <code>NOT_PAID</code>).</li>
                  <li><strong>Hạn nhận kho & đóng Đợt 2:</strong> Tối đa <strong>1 tháng</strong> kể từ ngày cọc (hạn chót: <strong>{maxStartIso()}</strong>).</li>
                  <li><strong>Hủy trước hạn &gt; 10 ngày:</strong> Hoàn trả <strong>100% tiền cọc ({money(stage1Deposit)}) ngay lập tức</strong>.</li>
                  <li><strong>Hủy trong 10 ngày cuối trước hạn:</strong> Khấu trừ 20% phí phạt, hoàn trả <strong>80% tiền cọc ({money(Math.round(stage1Deposit * 0.8))}) ngay lập tức</strong>.</li>
                  <li><strong>Nhận kho trong 10 ngày cuối trước hạn:</strong> Bị trừ 20% tiền cọc, khi hết hạn hợp đồng hoàn lại <strong>80% tiền cọc ({money(Math.round(stage1Deposit * 0.8))})</strong>.</li>
                  <li><strong>Quá hạn 1 tháng không nhận kho:</strong> Mất <strong>100% tiền cọc</strong>.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  )
}

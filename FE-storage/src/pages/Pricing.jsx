import { Link, useSearchParams } from 'react-router-dom'
import { unitTypeLabel } from '../utils/format.js'
import { Check, MapPin, Clock, Boxes, Tag, ChevronDown, ReceiptText } from 'lucide-react'
import { Card, Badge, Button, DataTable, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { groupByDistrict } from '../utils/facility.js'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { label, money } from '../utils/format.js'
import { depositText, inPeriod, pickRule, dailyRate, monthlyRate, priceText } from '../utils/pricing.js'
import CancellationPolicyItems, { useCancellationPolicy } from '../components/CancellationPolicy.jsx'
import { EarlyTerminationRuleItems } from '../components/EarlyTermination.jsx'
import { photo } from '../utils/photo.js'

const HERO_IMG = photo('1587293852726-70cdb56c2866', 'Kệ kho cao chất đầy thùng hàng trên pallet')
const HERO_SMALL = photo('1580674285054-bed31e145f59', 'Thùng hàng và bưu kiện xếp chồng', [400, 640, 900])
const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
import { SERVICES } from '../data/services.js'
import { areaText } from '../utils/unitFilter.js'


const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return t.sizeDescription || (d.length ? `${d.join(' × ')} m` : '—')
}

/** Bảng giá dịch vụ theo ngày: mỗi dịch vụ (kho thường / kho lạnh) kèm thông tin dịch vụ và giá từng loại kho. */
export default function Pricing() {
  const [params, setParams] = useSearchParams()
  const policy = useCancellationPolicy()
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const selected = Number(params.get('facility')) || facilities.data?.[0]?.id
  const setParam = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p) }
  const selectedFacility = facilities.data?.find((f) => f.id === selected)

  const data = useAsync(async () => {
    if (!selected) return null
    const [types, rules, units] = await Promise.all([
      api.unitTypes.listByFacility(selected),
      api.priceRules.list(),
      api.storageUnits.search({ facilityId: selected, status: 'AVAILABLE' }),
    ])
    return { types: types.filter((t) => t.active), rules, units }
  }, [selected])

  const columnsFor = (rules, units) => [
    { key: 'type', header: 'Loại kho', render: (t) => <><div className="cell-title">{unitTypeLabel(t.typeName)}</div><div className="cell-sub">{dims(t)}</div></> },
    { key: 'area', header: 'Diện tích', render: (t) => areaText(t) || '—' },
    {
      key: 'month', header: 'Giá thuê / tháng', render: (t) => {
        const m = monthlyRate(pickRule(rules, 'RENTAL', selected, t.id))
        return m != null ? <strong>{money(m)}</strong> : '—'
      }
    },
    {
      key: 'day', header: 'Quy đổi / ngày (tham khảo)', render: (t) => {
        const d = dailyRate(pickRule(rules, 'RENTAL', selected, t.id))
        return d ? <>{d.exact ? '' : '≈ '}{money(d.amount)}<div className="cell-sub">dùng tính phí quá hạn</div></> : '—'
      }
    },
    { key: 'deposit', header: 'Tiền cọc (Đợt 1)', render: (t) => depositText(pickRule(rules, 'DEPOSIT', selected, t.id)) },
    {
      key: 'avail', header: 'Tình trạng', render: (t) => {
        const n = units.filter((u) => u.unitTypeId === t.id).length
        return <Badge tone={n ? 'green' : 'neutral'}>{n ? `Còn ${n} ô` : 'Hết kho'}</Badge>
      }
    },
    {
      key: 'actions', header: '', className: 'actions', render: (t) => (
        <Button as={Link} to={`/locations/${selected}/unit-types/${t.id}`} size="sm" variant="secondary">Chi tiết</Button>)
    },
  ]

  // Phụ phí / giảm giá đang áp dụng cho cơ sở này (không gắn với một loại kho cụ thể).
  const extras = (data.data?.rules || []).filter((r) => !['RENTAL', 'DEPOSIT'].includes(r.priceType)
    && inPeriod(r) && r.unitTypeId == null && (r.facilityId == null || r.facilityId === selected))

  const shown = SERVICES
  const current = facilities.data?.find((f) => f.id === selected)
  const monthly = (data.data?.types || []).map((t) => monthlyRate(pickRule(data.data.rules, 'RENTAL', selected, t.id))).filter((v) => v != null)
  const fromMonth = monthly.length ? Math.min(...monthly) : null

  return (
    <section className="section">
      <div className="container">
        {/* Mở đầu: ảnh thật bên trái, tiêu đề + bộ lọc cơ sở bên phải */}
        <div className="price-hero">
          <div className="locx-visual price-visual">
            <figure className="locx-photo"><img src={HERO_IMG.src} srcSet={HERO_IMG.srcSet} sizes="(max-width: 900px) 92vw, 44vw" alt={HERO_IMG.alt} loading="eager" /></figure>
            <figure className="locx-photo locx-photo-small"><img src={HERO_SMALL.src} srcSet={HERO_SMALL.srcSet} sizes="(max-width: 900px) 40vw, 18vw" alt={HERO_SMALL.alt} loading="eager" /></figure>
            <div className="locx-float">
              <span className="locx-float-icon"><ReceiptText size={18} /></span>
              <div><strong>Giá rõ ràng</strong><small>Không phí ẩn, tính bằng ₫</small></div>
            </div>
          </div>

          <div>
            <div className="eyebrow">Bảng giá</div>
            <h1 className="locx-title">Bảng giá dịch vụ thuê kho</h1>
            <p className="lead">{`Giá thuê theo tháng của từng loại kho tại mỗi cơ sở, kèm tiền cọc và các dịch vụ đi kèm. Đặt kho tối đa ${policy.maxBookingMonths} tháng, muốn thuê thêm thì gia hạn. Đơn vị tiền: đồng (₫).`}</p>

            {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
              !facilities.data.length ? <EmptyState title="Chưa có cơ sở nào" /> : (
                <div className="price-filter">
                  <label className="price-select">
                    <span className="price-select-label"><MapPin size={15} /> Cơ sở</span>
                    <span className="price-select-box">
                      <select value={selected || ''} onChange={(e) => setParam('facility', e.target.value)} aria-label="Chọn cơ sở">
                        {/* Nhiều cơ sở: gom theo quận cho gọn. */}
                        {groupByDistrict(facilities.data).map(({ district, items }) => (
                          <optgroup key={district} label={district}>
                            {items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={18} aria-hidden="true" />
                    </span>
                  </label>
                  {current && (
                    <ul className="price-facility">
                      <li><MapPin size={15} />{current.address}</li>
                      {hhmm(current.openingTime) && <li><Clock size={15} />{hhmm(current.openingTime)} – {hhmm(current.closingTime)}</li>}
                    </ul>
                  )}
                  {data.data && (
                    <div className="price-quick">
                      <div><span><Boxes size={16} /></span><div><strong>{data.data.units.length}</strong><small>Ô kho còn trống</small></div></div>
                      <div><span><Tag size={16} /></span><div><strong>{fromMonth != null ? money(fromMonth) : '—'}</strong><small>Từ / tháng</small></div></div>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>

        {facilities.data?.length > 0 && (
            <>
              {data.loading || (!data.data && !data.error) ? <LoadingState /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : (
                <>
                  {shown.map(({ category: cat, icon: Icon, title, text, suitable, features, terms }) => {
                    const types = data.data?.types || []
                    return (
                      <Card key={cat} style={{ marginBottom: 32 }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
                          <div className="icon-tile" style={{ margin: 0 }}><Icon size={26} /></div>
                          <div><h3>{title}</h3><p className="muted">{text}</p></div>
                        </div>

                        <div className="grid grid-3" style={{ marginBottom: 24, gap: 24 }}>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Dịch vụ đi kèm</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                              {features.map((p) => <li key={p} className="loc-card"><span className="meta"><Check size={18} /><span>{p}</span></span></li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Điều khoản thuê</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                              {terms.map((p) => <li key={p} className="loc-card"><span className="meta"><Check size={18} /><span>{p}</span></span></li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="field-label" style={{ marginBottom: 6 }}>Phù hợp với</div>
                            <p className="muted">{suitable}</p>
                          </div>
                        </div>

                        <DataTable columns={columnsFor(data.data.rules, data.data.units)} rows={types} rowKey="id"
                          empty={<EmptyState title={`Chưa có kho thuộc nhóm ${title.toLowerCase()}` } message="Cơ sở này chưa cung cấp dịch vụ này. Vui lòng chọn cơ sở khác hoặc liên hệ nhân viên."
                            action={<Button as={Link} to={`/account/support?new=1&facility=${selected}&subject=${encodeURIComponent(`Tư vấn về ${title.toLowerCase()}`)}`} variant="secondary">Liên hệ tư vấn</Button>} />} />
                      </Card>
                    )
                  })}

                  {extras.length > 0 && (
                    <Card style={{ marginTop: 8 }}>
                      <h3 style={{ marginBottom: 12 }}>Phụ phí và khuyến mãi khác</h3>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {extras.map((r) => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span>{label(r.priceType)}</span><strong>{priceText(r)}</strong>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  <Card style={{ marginTop: 24 }}>
                    <h3 style={{ marginBottom: 12 }}>Cách thanh toán và chính sách hoàn cọc</h3>
                    <div className="grid grid-2" style={{ gap: 24 }}>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                        <li><strong>Đợt 1 – Đặt cọc:</strong> mặc định bằng 50% tổng tiền thuê (theo chính sách hiện hành của hệ thống), thanh toán trong {policy.unpaidHoldHours} giờ kể từ khi đặt kho, nếu không đơn tự hủy.</li>
                        <li><strong>Đợt 2 – Tiền thuê:</strong> toàn bộ tiền thuê theo số tháng đã đặt (tối đa {policy.maxBookingMonths} tháng), không cần trả trước khi nhận kho nhưng phải trả đủ trong vòng nửa thời gian thuê kể từ ngày bắt đầu; trễ hạn bị tính phí mỗi ngày và trễ quá {policy.stage2GraceDays} ngày hợp đồng bị hủy.</li>
                        <li><strong>Gia hạn:</strong> mỗi lần tối đa {policy.maxRenewalMonths} tháng, thanh toán bằng mã QR trên hệ thống.</li>
                        <li><strong>Nhắc hạn:</strong> hệ thống nhắc khi còn 10, 5, 3 và 1 ngày trước ngày hết hạn hợp đồng.</li>
                      </ul>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                        <CancellationPolicyItems policy={policy} />
                        <li><strong>Khi nhận kho:</strong> tiền cọc được giữ đến hết hợp đồng, hoàn lại sau khi trừ phí phát sinh (nếu có).</li>
                      </ul>
                    </div>
                    <h4 style={{ margin: '20px 0 8px' }}>Hủy hợp đồng sớm (sau khi đã nhận kho)</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                      <EarlyTerminationRuleItems policy={policy} />
                    </ul>
                  </Card>
                  <p className="muted small" style={{ marginTop: 16 }}>
                    Giá quy đổi theo ngày (dấu ≈) bằng giá thuê tháng chia 30, chỉ dùng để tính phí quá hạn và phí giữ kho. Đơn đặt kho được xác nhận sau khi quý khách đóng cọc Đợt 1.
                  </p>
                </>
              )}
            </>
        )}
      </div>
    </section>
  )
}

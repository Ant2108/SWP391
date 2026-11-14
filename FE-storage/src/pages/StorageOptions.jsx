import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Warehouse } from 'lucide-react'
import { LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import UnitTypeCard from '../components/UnitTypeCard.jsx'
import { UnitFilterBar, NoMatch } from '../components/UnitFilterBar.jsx'
import { filterUnitTypes, EMPTY_FILTERS, SIZE_OPTIONS } from '../utils/unitFilter.js'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { photo } from '../utils/photo.js'

// 4 ảnh thật xếp lưới 2x2 bên phải phần mở đầu, mỗi ảnh lơ lửng lệch nhịp nhau.
const FRAMES = [
  photo('1609143739217-01b60dad1c67', 'Khu kho với thùng hàng xếp chồng trên pallet', [400, 640, 900]),
  photo('1590247813693-5541d1c609fd', 'Kệ chứa các thùng hồ sơ có dán nhãn', [400, 640, 900]),
  photo('1580674285054-bed31e145f59', 'Thùng hàng và bưu kiện xếp gọn trong không gian nhỏ', [400, 640, 900]),
  photo('1586528116311-ad8dd3c8310d', 'Sàn cơ sở kho với các dãy thùng chứa', [400, 640, 900]),
]

export default function StorageOptions() {
  const [params, setParams] = useSearchParams()
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))
  const [filters, setFilters] = useState(() => {
    const size = params.get('size') || ''
    return { ...EMPTY_FILTERS, size: SIZE_OPTIONS.some((o) => o.value === size) ? size : '' }
  })
  const selected = Number(params.get('facility')) || facilities.data?.[0]?.id
  const setFacility = (id) => { const p = new URLSearchParams(params); p.set('facility', id); setParams(p) }

  const options = useAsync(async () => {
    if (!selected) return []
    const [types, units] = await Promise.all([
      api.unitTypes.listByFacility(selected),
      api.storageUnits.search({ facilityId: selected, status: 'AVAILABLE' }),
    ])
    return types.filter((t) => t.active).map((t) => ({ ...t, units: units.filter((u) => u.unitTypeId === t.id) }))
  }, [selected])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [])

  const all = options.data || []
  const shown = filterUnitTypes(all, filters)
  const freeUnits = all.reduce((n, t) => n + t.units.length, 0)
  const facilityOptions = (facilities.data || []).map((f) => ({ value: String(f.id), label: f.name }))

  return (
    <section className="section">
      <div className="container">
        {/* Mở đầu: chữ + bộ lọc bên trái, 4 khung ảnh thật lơ lửng bên phải */}
        <div className="so-hero">
          <div className="so-copy">
            <div className="eyebrow">Các loại kho</div>
            <h1 className="locx-title">Tìm kho phù hợp</h1>
            <p className="lead">Xem các kích cỡ kho tại từng cơ sở, so sánh kích thước và xem ô nào còn trống ngay bây giờ.</p>
            <div className="locx-stats">
              <div className="locx-stat"><span className="locx-stat-icon"><Warehouse size={20} /></span><div><strong>{options.data ? all.length : '—'}</strong><small>Loại kho tại đây</small></div></div>
              <div className="locx-stat"><span className="locx-stat-icon"><Boxes size={20} /></span><div><strong>{options.data ? freeUnits : '—'}</strong><small>Ô kho còn trống</small></div></div>
            </div>

            {facilities.loading ? <LoadingState /> : facilities.error ? <ErrorState error={facilities.error} onRetry={facilities.reload} /> :
              !facilities.data.length ? <EmptyState title="Chưa có cơ sở nào" /> : (
                <UnitFilterBar
                  filters={filters}
                  onChange={setFilters}
                  count={shown.length}
                  total={all.length}
                  facility={{ value: selected, options: facilityOptions, onChange: setFacility }}
                />
              )}
          </div>

          <div className="so-frames" aria-hidden="true">
            {FRAMES.map((img, i) => (
              <figure key={img.src} className={`so-frame so-frame-${i + 1}`}>
                <img src={img.src} srcSet={img.srcSet} sizes="(max-width: 900px) 45vw, 22vw" alt="" loading="eager" />
              </figure>
            ))}
          </div>
        </div>

        {/* Kết quả */}
        {facilities.data?.length > 0 && (
          options.loading ? <LoadingState /> : options.error ? <ErrorState error={options.error} onRetry={options.reload} /> :
            !all.length ? <EmptyState title="Chưa có loại kho nào" message="Cơ sở này chưa công bố kích cỡ kho nào." /> :
              shown.length === 0 ? <NoMatch facilityId={selected} onReset={() => setFilters(EMPTY_FILTERS)} /> : (
                <div className="ut-grid">
                  {shown.map((t) => <UnitTypeCard key={t.id} facilityId={selected} type={t} units={t.units} />)}
                </div>
              )
        )}
      </div>
    </section>
  )
}

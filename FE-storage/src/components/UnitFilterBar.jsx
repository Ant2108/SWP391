import { Link } from 'react-router-dom'
import { Search, X, SearchX, MessageSquare, ChevronDown, MapPin, Maximize2, CircleCheck, RotateCcw } from 'lucide-react'
import { Button } from './ui.jsx'
import { SIZE_OPTIONS, EMPTY_FILTERS, hasFilters } from '../utils/unitFilter.js'

const AVAILABILITY = [
  { value: '', label: 'Tất cả loại kho' },
  { value: 'yes', label: 'Còn ô trống' },
]

/** Ô chọn dạng dropdown có biểu tượng và nhãn nhỏ phía trên. */
export function FilterSelect({ icon: Icon, label, value, onChange, options }) {
  return (
    <label className="ufx-select">
      <span className="ufx-label">{Icon && <Icon size={14} />}{label}</span>
      <span className="ufx-box">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={17} aria-hidden="true" />
      </span>
    </label>
  )
}

/**
 * Bộ lọc loại kho: ô tìm kiếm + các dropdown (cơ sở, kích thước, tình trạng). `count` = số kết quả sau lọc.
 * `facility` (tuỳ chọn): { value, options: [{value,label}], onChange } để chọn cơ sở ngay trong bộ lọc.
 */
export function UnitFilterBar({ filters, onChange, count, total, showSearch = true, facility }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  const active = hasFilters(filters)
  const sizeOptions = SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.hint ? `${o.label} (${o.hint})` : o.label }))

  return (
    <div className="ufx">
      {showSearch && (
        <div className="ufilter-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })}
            placeholder="Tìm theo tên, kích cỡ (ví dụ 3x3) hoặc mã ô kho…" aria-label="Tìm kho" />
          {filters.q && <button type="button" className="ufilter-clear" onClick={() => set({ q: '' })} aria-label="Xóa tìm kiếm"><X size={16} /></button>}
        </div>
      )}
      <div className={`ufx-row ${facility ? 'has-facility' : ''}`}>
        {facility && <FilterSelect icon={MapPin} label="Cơ sở" value={String(facility.value ?? '')} onChange={facility.onChange} options={facility.options} />}
        <FilterSelect icon={Maximize2} label="Kích cỡ" value={filters.size} onChange={(size) => set({ size })} options={sizeOptions} />
        <FilterSelect icon={CircleCheck} label="Tình trạng" value={filters.availableOnly ? 'yes' : ''} onChange={(v) => set({ availableOnly: v === 'yes' })} options={AVAILABILITY} />
      </div>
      <div className="ufx-meta">
        <span aria-live="polite"><strong>{count}</strong> / {total} loại kho</span>
        {active && <button type="button" className="ufx-reset" onClick={() => onChange(EMPTY_FILTERS)}><RotateCcw size={14} /> Đặt lại bộ lọc</button>}
      </div>
    </div>
  )
}

/** Hiện khi không có loại kho nào khớp bộ lọc. */
export function NoMatch({ facilityId, onReset }) {
  const to = `/account/support?new=1${facilityId ? `&facility=${facilityId}` : ''}&subject=${encodeURIComponent('Tìm kho phù hợp')}`
  return (
    <div className="no-match" role="status">
      <div className="no-match-icon"><SearchX size={30} /></div>
      <h3>Không có kho phù hợp với bộ lọc</h3>
      <p className="muted">Chúng tôi chưa tìm thấy kho phù hợp với nhu cầu của quý khách. Vui lòng liên hệ nhân viên để được tư vấn thêm hoặc gợi ý kho phù hợp.</p>
      <div className="no-match-actions">
        <Button as={Link} to={to}><MessageSquare size={18} /> Liên hệ nhân viên</Button>
        <Button variant="secondary" onClick={onReset}>Xóa bộ lọc</Button>
      </div>
    </div>
  )
}

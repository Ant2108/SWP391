import { Link } from 'react-router-dom'
import { Search, X, SearchX, MessageSquare } from 'lucide-react'
import { Button } from './ui.jsx'
import { SIZE_OPTIONS, EMPTY_FILTERS, hasFilters } from '../utils/unitFilter.js'

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="ufilter-group" role="group" aria-label={label}>
      <span className="ufilter-label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button key={o.value} type="button" className={`seg ${value === o.value ? 'active' : ''}`} aria-pressed={value === o.value}
            onClick={() => onChange(o.value)} title={o.hint}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Thanh lọc loại kho: ô tìm kiếm, loại, kích thước, chỉ hiện kho còn trống. `count` = số kết quả sau lọc. */
export function UnitFilterBar({ filters, onChange, count, total, showSearch = true }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  const active = hasFilters(filters)
  return (
    <div className="ufilter">
      {showSearch && (
        <div className="ufilter-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })}
            placeholder="Search by name, size (e.g. 3x3), unit code or location…" aria-label="Search units" />
          {filters.q && <button type="button" className="ufilter-clear" onClick={() => set({ q: '' })} aria-label="Clear search"><X size={16} /></button>}
        </div>
      )}
      <div className="ufilter-row">
        <Segmented label="Size" options={SIZE_OPTIONS} value={filters.size} onChange={(size) => set({ size })} />
        <label className="ufilter-check">
          <input type="checkbox" checked={filters.availableOnly} onChange={(e) => set({ availableOnly: e.target.checked })} />
          <span>Available only</span>
        </label>
        <div className="ufilter-meta">
          <span className="muted small" aria-live="polite">{count} of {total} shown</span>
          {active && <button type="button" className="ufilter-reset" onClick={() => onChange(EMPTY_FILTERS)}>Reset filters</button>}
        </div>
      </div>
    </div>
  )
}

/** Hiện khi không có loại kho nào khớp bộ lọc. */
export function NoMatch({ facilityId, onReset }) {
  const to = `/account/support?new=1${facilityId ? `&facility=${facilityId}` : ''}&subject=${encodeURIComponent('Looking for a storage unit')}`
  return (
    <div className="no-match" role="status">
      <div className="no-match-icon"><SearchX size={30} /></div>
      <h3>This product does not exist</h3>
      <p className="muted">We couldn't find a unit that matches what you are looking for. Please contact our staff to get more information or a suitable suggestion.</p>
      <div className="no-match-actions">
        <Button as={Link} to={to}><MessageSquare size={18} /> Contact staff</Button>
        <Button variant="secondary" onClick={onReset}>Clear filters</Button>
      </div>
    </div>
  )
}

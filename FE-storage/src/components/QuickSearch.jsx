import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, Snowflake, Ruler } from 'lucide-react'
import { Button } from './ui.jsx'
import { SIZE_OPTIONS, TYPE_OPTIONS } from '../utils/unitFilter.js'

/** Ô tìm kho nhanh ở trang chủ: chọn cơ sở, loại kho, kích thước rồi chuyển sang Storage Options với bộ lọc đã điền sẵn. */
export default function QuickSearch({ facilities = [] }) {
  const navigate = useNavigate()
  const [facility, setFacility] = useState('')
  const [type, setType] = useState('')
  const [size, setSize] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const p = new URLSearchParams()
    if (facility) p.set('facility', facility)
    if (type) p.set('type', type)
    if (size) p.set('size', size)
    navigate(`/storage-options${p.toString() ? `?${p}` : ''}`)
  }

  return (
    <form className="quick-search" onSubmit={submit} aria-label="Find a storage unit">
      <label className="qs-field">
        <span className="qs-label"><MapPin size={15} /> Location</span>
        <select value={facility} onChange={(e) => setFacility(e.target.value)}>
          <option value="">Any facility</option>
          {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className="qs-field">
        <span className="qs-label"><Snowflake size={15} /> Storage type</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="qs-field">
        <span className="qs-label"><Ruler size={15} /> Size</span>
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}{o.hint ? ` (${o.hint})` : ''}</option>)}
        </select>
      </label>
      <Button type="submit" size="lg"><Search size={20} /> Search units</Button>
    </form>
  )
}

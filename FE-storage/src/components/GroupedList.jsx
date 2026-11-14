import { useState } from 'react'
import { LayoutList, Layers, ChevronDown, ChevronRight } from 'lucide-react'
import { DataTable } from './ui.jsx'

/**
 * Danh sách có 2 kiểu xem: "Bảng chi tiết" và "Tóm tắt theo loại" (gom theo loại kho; mỗi mục là một ô thẻ xếp ngang, ghi các thông tin quan trọng),
 * kèm bộ lọc theo loại kho (và trạng thái nếu có truyền statusOptions).
 * - items: toàn bộ dữ liệu; typeOf(item): tên loại kho; columns/rowKey/empty: như DataTable
 * - renderCard(item): nội dung một ô thẻ ở kiểu tóm tắt; groupNote(list): ghi chú bên phải tiêu đề nhóm (không bắt buộc)
 */
export default function GroupedList({ items, typeOf, columns, rowKey = 'id', empty, renderCard, groupNote, storageKey, statusOptions, statusOf }) {
  const [view, setView] = useState(() => { try { return localStorage.getItem(storageKey) || 'table' } catch { return 'table' } })
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [closed, setClosed] = useState({})
  const changeView = (v) => { setView(v); try { localStorage.setItem(storageKey, v) } catch { /* bỏ qua */ } }

  const all = items || []
  const counts = all.reduce((m, r) => { m[typeOf(r)] = (m[typeOf(r)] || 0) + 1; return m }, {})
  const rows = all.filter((r) => (typeFilter === 'ALL' || typeOf(r) === typeFilter) && (statusFilter === 'ALL' || (statusOf && statusOf(r) === statusFilter)))
  const groups = Object.entries(rows.reduce((m, r) => { (m[typeOf(r)] ||= []).push(r); return m }, {}))

  return (
    <>
      {all.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="segmented" role="group" aria-label="Lọc theo loại kho">
            {['ALL', ...Object.keys(counts)].map((t) => (
              <button key={t} type="button" className={`seg ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
                {t === 'ALL' ? `Tất cả (${all.length})` : `${t} (${counts[t]})`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {statusOptions && (
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Lọc theo trạng thái" style={{ minWidth: 190, width: 'auto', minHeight: 40, padding: '8px 12px' }}>
                <option value="ALL">Mọi trạng thái</option>
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
              </select>
            )}
            <div className="segmented" role="group" aria-label="Kiểu hiển thị">
              <button type="button" className={`seg ${view === 'table' ? 'active' : ''}`} onClick={() => changeView('table')} title="Dạng bảng chi tiết"><LayoutList size={15} /> Bảng chi tiết</button>
              <button type="button" className={`seg ${view === 'group' ? 'active' : ''}`} onClick={() => changeView('group')} title="Tóm tắt, gom theo loại kho"><Layers size={15} /> Tóm tắt theo loại</button>
            </div>
          </div>
        </div>
      )}
      {view === 'table' || !rows.length ? (
        <DataTable columns={columns} rows={rows} rowKey={rowKey} empty={all.length ? null : empty} />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(([name, list]) => {
            const open = !closed[name]
            const Chev = open ? ChevronDown : ChevronRight
            return (
              <div key={name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <button type="button" onClick={() => setClosed((c) => ({ ...c, [name]: open }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'var(--surface-2)', color: 'var(--text)', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  <Chev size={18} />
                  <strong style={{ fontSize: 16 }}>{name}</strong>
                  <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--accent-text)' }}>{list.length}</span>
                  {groupNote && <span className="muted small" style={{ marginLeft: 'auto' }}>{groupNote(list)}</span>}
                </button>
                {open && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14, padding: 16 }}>
                    {list.map((r) => (
                      <div key={r[rowKey]} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14 }}>
                        {renderCard ? renderCard(r) : columns.map((c) => <div key={c.key}>{c.render ? c.render(r) : r[c.key]}</div>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** Một dòng "nhãn: giá trị" trong ô thẻ tóm tắt. */
export const TileRow = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
    <span className="muted">{label}</span>
    <span style={{ textAlign: 'right', fontWeight: 500 }}>{children}</span>
  </div>
)

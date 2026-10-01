import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, X, Inbox, AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'

/* ---------- Button ---------- */
export function Button({ variant = 'primary', size = 'md', loading, disabled, as: As, className = '', children, ...rest }) {
  const cls = `btn btn-${variant} btn-${size} ${className}`
  if (As === Link) return <Link className={cls} {...rest}>{children}</Link>
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ hover, className = '', children, ...rest }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`} {...rest}>{children}</div>
}

/* ---------- Form fields ---------- */
export function Field({ label, error, hint, children }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}
export const Input = ({ label, error, hint, ...p }) => (
  <Field label={label} error={error} hint={hint}>
    {p.type === 'password'
      ? <PasswordInput className={`input ${error ? 'is-invalid' : ''}`} {...p} />
      : <input className={`input ${error ? 'is-invalid' : ''}`} {...p} />}
  </Field>
)
// Ô mật khẩu có nút con mắt để ẩn/hiện.
function PasswordInput({ type, ...p }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="input-wrap">
      <input type={shown ? 'text' : 'password'} {...p} />
      <button type="button" className="input-eye" onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}>
        {shown ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  )
}
export const Textarea = ({ label, error, hint, ...p }) => (
  <Field label={label} error={error} hint={hint}><textarea className={`input textarea ${error ? 'is-invalid' : ''}`} rows={3} {...p} /></Field>
)
export const Select = ({ label, error, hint, children, ...p }) => (
  <Field label={label} error={error} hint={hint}><select className={`input ${error ? 'is-invalid' : ''}`} {...p}>{children}</select></Field>
)

/* ---------- Badge ---------- */
const TONE = {
  ACTIVE: 'green', AVAILABLE: 'green', COMPLETED: 'green', APPROVED: 'green',
  INACTIVE: 'neutral', PENDING: 'yellow', RESERVED: 'yellow', INSPECTION: 'yellow',
  OCCUPIED: 'blue', MAINTENANCE: 'red', BLOCKED: 'red', REJECTED: 'red', CANCELLED: 'red',
}
export function Badge({ status, tone, children }) {
  const t = tone || TONE[status] || 'neutral'
  return <span className={`badge badge-${t}`}>{children ?? String(status).replace(/_/g, ' ')}</span>
}

/* ---------- Modal / ConfirmDialog ---------- */
export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmText = 'Confirm', danger, loading, onConfirm, onClose }) {
  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmText}</Button>
      </>}>
      <p className="muted">{message}</p>
    </Modal>
  )
}

/* ---------- Page header / states ---------- */
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="lead">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="state"><Loader2 size={28} className="spin" /><p>{label}</p></div>
)
export const EmptyState = ({ title = 'Nothing here yet', message, action }) => (
  <div className="state"><div className="state-icon"><Inbox size={28} /></div><h3>{title}</h3>{message && <p>{message}</p>}{action}</div>
)
export const ErrorState = ({ error, onRetry }) => (
  <div className="state">
    <div className="state-icon state-icon-red"><AlertTriangle size={28} /></div>
    <h3>Something went wrong</h3>
    <p>{error?.message || 'Unexpected error'}</p>
    {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
  </div>
)

/* ---------- Table + pagination ---------- */
export function DataTable({ columns, rows, rowKey, pageSize = 10, empty }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  if (!rows.length) return empty || <EmptyState />
  const slice = rows.slice((page - 1) * pageSize, page * pageSize)
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table className="table stack">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r[rowKey]}>
                {columns.map((c) => <td key={c.key} className={c.className} data-label={c.header}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <Pagination page={page} pages={pages} total={rows.length} pageSize={pageSize} onChange={setPage} />}
    </div>
  )
}

export function Pagination({ page, pages, total, pageSize, onChange }) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="pagination">
      <span className="muted small">{from}–{to} of {total}</span>
      <div className="pagination-btns">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button>
        <span className="small">{page} / {pages}</span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

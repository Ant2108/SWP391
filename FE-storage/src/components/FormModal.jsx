import { useState } from 'react'
import { Button, Modal } from './ui.jsx'

/** Modal chứa form: tự quản lý loading + hiển thị lỗi từ API. onSubmit phải trả Promise. */
export default function FormModal({ open, title, onClose, onSubmit, submitText = 'Save', wide, children }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try { await onSubmit() } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <Modal open={open} title={title} onClose={loading ? () => {} : onClose} wide={wide}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button type="submit" form="form-modal" loading={loading}>{submitText}</Button>
      </>}>
      <form id="form-modal" onSubmit={handle} noValidate>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <div className="form-grid">{children}</div>
      </form>
    </Modal>
  )
}

export const orNull = (v) => (v === '' || v === undefined ? null : v)
export const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v))

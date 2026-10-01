import { Card } from './ui.jsx'
import { Brand } from '../layouts/PublicLayout.jsx'

export default function AuthShell({ title, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: 20 }}><Brand to="/" /></div>
        <h1 style={{ fontSize: 24, margin: '0 0 16px' }}>{title}</h1>
        {children}
        {footer && <div className="field-hint" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>{footer}</div>}
      </Card>
    </div>
  )
}

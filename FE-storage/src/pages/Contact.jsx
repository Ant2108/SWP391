import { MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { PageHeader, Card, Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

export default function Contact() {
  const { data, loading, error, reload } = useAsync(() => api.facilities.list('ACTIVE'))
  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Liên hệ" title="Nhận báo giá"
          subtitle="Gọi điện hoặc đến trực tiếp bất kỳ cơ sở nào, hoặc gửi yêu cầu cho nhân viên để được giúp chọn kho và giá phù hợp."
          actions={<Button as={Link} to="/support"><MessageSquare size={18} /> Liên hệ nhân viên</Button>} />
        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
          !data.length ? <EmptyState title="Chưa có thông tin liên hệ" /> : (
            <div className="grid grid-3">
              {data.map((f) => (
                <Card key={f.id} className="loc-card">
                  <h3>{f.name}</h3>
                  <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
                  {f.phone && <div className="meta"><Phone size={18} /><a href={`tel:${f.phone}`}>{f.phone}</a></div>}
                  <Button as={Link} to={`/support?facility=${f.id}`} variant="secondary" size="sm" style={{ alignSelf: "flex-start", marginTop: 8 }}>Liên hệ nhân viên</Button>
                </Card>
              ))}
            </div>
          )}
      </div>
    </section>
  )
}

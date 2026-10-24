import { Link } from 'react-router-dom'
import { MapPin, CalendarDays } from 'lucide-react'
import { PageHeader, Card, Button, Badge, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { mock } from '../../api/mock.js'
import { money, fmtDate } from '../../utils/format.js'

const daysLeft = (end) => Math.ceil((new Date(end) - new Date()) / 86400000)

export default function MyUnits() {
  const { data, loading, error, reload } = useAsync(() => mock.rentals.list())
  return (
    <>
      <PageHeader title="My storage units" subtitle="Units you are currently renting." actions={<Button as={Link} to="/storage-options">Rent another</Button>} />
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
        !data.length ? <EmptyState title="No rented units" message="Units you rent will show up here." /> : (
          <div className="grid grid-3">
            {data.map((u) => (
              <Card key={u.id} className="loc-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <h3>{u.unitCode || u.unitTypeName}</h3><Badge status={u.status} />
                </div>
                <div className="muted">{u.unitTypeName}</div>
                <div className="meta"><MapPin size={18} /><span>{u.facilityName}</span></div>
                <div className="meta"><CalendarDays size={18} /><span>{fmtDate(u.startDate)} → {fmtDate(u.endDate)}{u.status === 'ACTIVE' && daysLeft(u.endDate) >= 0 ? ` (${daysLeft(u.endDate)} days left)` : ''}</span></div>
                <div className="meta"><span>{money(u.monthlyPrice)} / month</span></div>
                <Button as={Link} to={`/account/reservations/${u.reservationId}`} size="sm" variant="secondary" style={{ alignSelf: 'flex-start', marginTop: 8 }}>Reservation details</Button>
              </Card>
            ))}
          </div>
        )}
    </>
  )
}

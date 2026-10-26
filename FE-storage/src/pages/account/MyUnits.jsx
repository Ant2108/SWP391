import { Link } from 'react-router-dom'
import { MapPin, CalendarDays, FileText, CalendarCheck } from 'lucide-react'
import { PageHeader, Card, Button, Badge, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { api } from '../../api/client.js'
import { money, fmtDate } from '../../utils/format.js'

const daysLeft = (end) => Math.ceil((new Date(end) - new Date()) / 86400000)

export default function MyUnits() {
  const { data, loading, error, reload } = useAsync(() => api.rentalContracts.my())
  const rows = data || []

  return (
    <>
      <PageHeader
        title="My Storage Units"
        subtitle="Storage units associated with your rental contracts."
        actions={<Button as={Link} to="/storage-options">Rent another unit</Button>}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !rows.length ? (
        <EmptyState
          title="No rented units yet"
          message="Once your reservation is confirmed and the deposit is paid, your rented unit will appear here."
          action={<Button as={Link} to="/storage-options">Browse storage units</Button>}
        />
      ) : (
        <div className="grid grid-3">
          {rows.map((c) => (
            <Card key={c.id} className="loc-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>Unit {c.unitCode || `#${c.storageUnitId}`}</h3>
                <Badge status={c.status} />
              </div>
              <div className="muted">{c.unitTypeName || 'Storage Unit'} · Contract #{c.id}</div>
              <div className="meta">
                <MapPin size={18} />
                <span>{c.facilityName || `Facility #${c.facilityId || ''}`}</span>
              </div>
              <div className="meta">
                <CalendarDays size={18} />
                <span>
                  {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                  {c.status === 'ACTIVE' && daysLeft(c.endDate) >= 0 ? ` (${daysLeft(c.endDate)} days left)` : ''}
                </span>
              </div>
              <div className="meta">
                <span>
                  <strong>{money(c.monthlyPrice)}</strong> / month (Deposit: {money(c.depositAmount)})
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <Button as={Link} to={`/account/contracts/${c.id}`} size="sm" variant="secondary">
                  <FileText size={14} /> Contract details
                </Button>
                {c.status === 'PENDING' && (
                  <Button as={Link} to="/account/appointments" size="sm">
                    <CalendarCheck size={14} /> Book Check-in
                  </Button>
                )}
                {['ACTIVE', 'OVERDUE'].includes(c.status) && (
                  <Button as={Link} to="/account/appointments" size="sm" variant="secondary">
                    <CalendarCheck size={14} /> Book Return / Support
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

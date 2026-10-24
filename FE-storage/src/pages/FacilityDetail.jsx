import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone, Clock } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import UnitTypeCard from '../components/UnitTypeCard.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

const hhmm = (v) => (v ? v.slice(0, 5) : '—')
/** Facility Detail + Unit Type List + Available Unit information cho customer. */
export default function FacilityDetail() {
  const { id } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [facility, types, units] = await Promise.all([
      api.facilities.get(id),
      api.unitTypes.listByFacility(id),
      api.storageUnits.search({ facilityId: id, status: 'AVAILABLE' }),
    ])
    return { facility, types: types.filter((t) => t.active), units }
  }, [id])

  if (loading) return <section className="section"><div className="container"><LoadingState /></div></section>
  if (error) return <section className="section"><div className="container"><ErrorState error={error} onRetry={reload} /></div></section>

  const { facility: f, types, units } = data
  const typeName = (unit) => unit.unitTypeName || types.find((t) => t.id === unit.unitTypeId)?.typeName
  
  const unitColumns = [
    { key: 'code', header: 'Unit', render: (u) => <div className="cell-title">{u.unitCode}</div> },
    { key: 'type', header: 'Type', render: (u) => typeName(u) },
    { key: 'floor', header: 'Floor', render: (u) => u.floor || '—' },
    { key: 'location', header: 'Location', render: (u) => u.location || '—' },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (u) => (
      <Button as={Link} to={`/checkout?facility=${f.id}&unitType=${u.unitTypeId}`} size="sm">Payment</Button>) },
  ]

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow={<Link to="/locations"><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> All locations</Link>}
          title={f.name} subtitle={f.status === 'ACTIVE' ? 'Facility details, unit sizes and available units.' : 'This facility is currently closed.'}
          actions={<Button as={Link} to={`/account/support?new=1&facility=${f.id}`} variant="secondary">Contact staff</Button>} />

        <Card className="loc-card" style={{ marginBottom: 40 }}>
          <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
          {f.phone && <div className="meta"><Phone size={18} /><a href={`tel:${f.phone}`}>{f.phone}</a></div>}
          <div className="meta"><Clock size={18} /><span>Open {hhmm(f.openingTime)} – {hhmm(f.closingTime)}</span></div>
          <div className="meta"><Badge status={f.status} /><Badge tone={units.length ? "green" : "neutral"}>{units.length ? `${units.length} units available` : "No units available"}</Badge></div>
        </Card>

        <h2 style={{ fontSize: 32, marginBottom: 24 }}>Unit types</h2>
        {!types.length ? <EmptyState title="No unit types yet" message="This facility has not published any unit sizes." /> : (
          <div className="grid grid-3" style={{ marginBottom: 48 }}>
            {types.map((t) => <UnitTypeCard key={t.id} facilityId={f.id} type={t} units={units.filter((u) => u.unitTypeId === t.id)} />)}
          </div>
        )}

        <h2 style={{ fontSize: 32, marginBottom: 24 }}>Available units</h2>
        <DataTable columns={unitColumns} rows={units} rowKey="id" empty={<EmptyState title="No units available" message="All units are currently taken. Check back soon or contact our staff." />} />
      </div>
    </section>
  )
}

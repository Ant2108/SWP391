import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ruler, MapPin, AlertCircle } from 'lucide-react'
import { PageHeader, Card, Badge, Button, DataTable, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import UnitImage from '../components/UnitImage.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { priceText } from '../utils/pricing.js'

const dims = (t) => {
  const d = [t.width, t.length, t.height].filter((v) => v != null)
  return d.length ? d.join(' × ') + ' m' : null
}

/** Chi tiết một loại kho: ảnh, thông tin, giá và các ô còn trống. Thanh toán để đặt chỗ ở đây. */
export default function UnitTypeDetail() {
  const { facilityId, typeId } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [facility, types, units, rent, deposit] = await Promise.all([
      api.facilities.get(facilityId),
      api.unitTypes.listByFacility(facilityId),
      api.storageUnits.search({ facilityId, unitTypeId: typeId, status: 'AVAILABLE' }),
      api.priceRules.current({ priceType: 'RENTAL', facilityId, unitTypeId: typeId }).catch(() => null),
      api.priceRules.current({ priceType: 'DEPOSIT', facilityId, unitTypeId: typeId }).catch(() => null),
    ])
    return { facility, type: types.find((t) => String(t.id) === String(typeId)), units, rent, deposit }
  }, [facilityId, typeId])

  const wrap = (node) => <section className="section"><div className="container">{node}</div></section>
  if (loading) return wrap(<LoadingState />)
  if (error) return wrap(<ErrorState error={error} onRetry={reload} />)
  if (!data.type) return wrap(<EmptyState title="Unit type not found" action={<Button as={Link} to={`/locations/${facilityId}`}>Back to facility</Button>} />)

  const { facility: f, type: t, units, rent, deposit } = data
  const booked = units.length === 0
  const cold = t.storageCategory === 'COLD'

  const columns = [
    { key: 'code', header: 'Unit', render: (u) => <div className="cell-title">{u.unitCode}</div> },
    { key: 'floor', header: 'Floor', render: (u) => u.floor || '—' },
    { key: 'location', header: 'Location', render: (u) => u.location || '—' },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.status} /> },
  ]

  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow={<Link to={`/locations/${f.id}`}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> {f.name}</Link>}
          title={t.typeName} subtitle={t.description || (cold ? 'Cold storage unit' : 'Standard storage unit')} />

        {booked && (
          <div className="form-alert" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <AlertCircle size={18} /> This unit has already been booked. Please choose another size or check back soon.
          </div>
        )}

        <div className="grid grid-2" style={{ alignItems: 'start', marginBottom: 40 }}>
          <Card>
            <UnitImage imageUrl={t.imageUrl} category={t.storageCategory} name={t.typeName} width={t.width} length={t.length} height={t.height} booked={booked} />
          </Card>
          <Card className="loc-card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={cold ? 'blue' : 'neutral'}>{cold ? 'Cold storage' : 'Standard'}</Badge>
              <Badge tone={booked ? 'neutral' : 'green'}>{booked ? 'Booked' : `${units.length} available`}</Badge>
            </div>
            {(t.sizeDescription || dims(t)) && <div className="meta"><Ruler size={18} /><span>{t.sizeDescription || dims(t)}{t.sizeDescription && dims(t) ? ` (${dims(t)})` : ''}</span></div>}
            <div className="meta"><MapPin size={18} /><span>{f.name} · {f.address}</span></div>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Rental price</span><strong style={{ fontSize: 22 }}>{priceText(rent)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Deposit</span><span>{priceText(deposit)}</span></div>
            <p className="muted small">Your unit is booked once payment is completed.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button as={Link} to={`/checkout?facility=${f.id}&unitType=${t.id}`} size="lg"
                style={booked ? { pointerEvents: 'none', opacity: 0.55 } : undefined} aria-disabled={booked}>Payment</Button>
              <Button as={Link} to={`/account/support?new=1&facility=${f.id}&subject=${encodeURIComponent(`Question about ${t.typeName}`)}`} variant="secondary" size="lg">Contact staff</Button>
            </div>
          </Card>
        </div>

        <h2 style={{ fontSize: 32, marginBottom: 24 }}>Available units</h2>
        <DataTable columns={columns} rows={units} rowKey="id" empty={<EmptyState title="Booked" message="All units of this type have been booked." />} />
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Phone } from 'lucide-react'
import { PageHeader, Card, Badge, Button, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import UnitTypeCard from '../components/UnitTypeCard.jsx'
import { UnitFilterBar, NoMatch } from '../components/UnitFilterBar.jsx'
import { filterUnitTypes, EMPTY_FILTERS } from '../utils/unitFilter.js'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'
import { stockOf, canBook } from '../utils/facility.js'

/** Facility Detail + Unit Type List cho customer. Ô trống của từng loại kho xem ở trang chi tiết loại kho. */
export default function FacilityDetail() {
  const { id } = useParams()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
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
  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow={<Link to="/locations"><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Tất cả cơ sở</Link>}
          title={f.name} subtitle={f.status === 'ACTIVE' ? 'Thông tin cơ sở và các loại kho. Mở một loại kho để xem các ô còn trống.' : 'Cơ sở này hiện đang đóng cửa.'}
          actions={<Button as={Link} to={`/account/support?new=1&facility=${f.id}`} variant="secondary">Liên hệ nhân viên</Button>} />

        <Card className="loc-card" style={{ marginBottom: 40 }}>
          <div className="meta"><MapPin size={18} /><span>{f.address}</span></div>
          {f.phone && <div className="meta"><Phone size={18} /><a href={`tel:${f.phone}`}>{f.phone}</a></div>}
          <div className="meta"><Badge status={f.status} /><Badge tone={stockOf(f).tone}>{stockOf(f).label}</Badge><Badge tone={units.length ? "green" : "neutral"}>{units.length ? `${units.length} ${units.length === 1 ? "unit" : "units"} available` : "Không còn ô kho nào"}</Badge></div>
        </Card>

        {!canBook(f) && f.status === 'ACTIVE' && (
          <div className="form-alert" role="status" style={{ marginBottom: 24 }}>
            {f.stockStatus === 'COMING_SOON' ? 'Cơ sở này sắp ra mắt, chưa mở đặt kho.' : 'Cơ sở này hiện đã hết kho. Vui lòng quay lại sau hoặc liên hệ nhân viên.'}
          </div>
        )}

        <h2 style={{ fontSize: 32, marginBottom: 24 }}>Các loại kho</h2>
        {!types.length ? <EmptyState title="Chưa có loại kho nào" message="Cơ sở này chưa công bố kích cỡ kho nào." /> : (
          <div style={{ marginBottom: 48 }}>
            {(() => {
              const withUnits = types.map((t) => ({ ...t, units: units.filter((u) => u.unitTypeId === t.id) }))
              const shown = filterUnitTypes(withUnits, filters)
              return (
                <>
                  <UnitFilterBar filters={filters} onChange={setFilters} count={shown.length} total={withUnits.length} showSearch={false} />
                  {shown.length === 0
                    ? <NoMatch facilityId={f.id} onReset={() => setFilters(EMPTY_FILTERS)} />
                    : <div className="ut-grid">{shown.map((t) => <UnitTypeCard key={t.id} facilityId={f.id} type={t} units={t.units} />)}</div>}
                </>
              )
            })()}
          </div>
        )}

      </div>
    </section>
  )
}

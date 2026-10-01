import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'
import { FacilityCard } from './Home.jsx'
import { useAsync } from '../hooks/useAsync.js'
import { api } from '../api/client.js'

export default function Locations() {
  const { data, loading, error, reload } = useAsync(() => api.facilities.list('ACTIVE'))
  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="Locations" title="Our storage facilities" subtitle="Choose a facility close to home or work and see which units are available." />
        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
          !data.length ? <EmptyState title="No locations available" message="Please check back soon." /> : (
            <div className="grid grid-3">{data.map((f) => <FacilityCard key={f.id} f={f} />)}</div>
          )}
      </div>
    </section>
  )
}

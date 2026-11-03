import { Link } from 'react-router-dom'
import { Building2, Package, CheckCircle2, Tag } from 'lucide-react'
import { PageHeader, Card, Button, LoadingState, ErrorState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { api, UNIT_STATUSES } from '../../api/client.js'

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [facilities, units, rules] = await Promise.all([api.facilities.list(), api.storageUnits.search({}), api.priceRules.list()])
    return { facilities, units, rules }
  })

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const { facilities, units, rules } = data
  const count = (s) => units.filter((u) => u.status === s).length
  const stats = [
    { label: 'Active facilities', value: facilities.filter((f) => f.status === 'ACTIVE').length, icon: Building2 },
    { label: 'Storage units', value: units.length, icon: Package },
    { label: 'Available units', value: count('AVAILABLE'), icon: CheckCircle2 },
    { label: 'Active price rules', value: rules.filter((r) => r.active).length, icon: Tag },
  ]

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of your storage operations."
        actions={<Button as={Link} to="/admin/storage-units" variant="secondary">Manage units</Button>} />
      <div className="grid grid-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="stat-card">
            <div className="stat-label"><Icon size={18} /> {label}</div>
            <div className="stat-num">{value}</div>
          </Card>
        ))}
      </div>
      <Card style={{ marginTop: 28 }}>
        <h3>Unit status</h3>
        <div className="bar-list">
          {UNIT_STATUSES.map((s) => (
            <div className="bar-row" key={s}>
              <span>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
              <div className="bar"><i style={{ width: units.length ? `${(count(s) / units.length) * 100}%` : 0 }} /></div>
              <strong>{count(s)}</strong>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

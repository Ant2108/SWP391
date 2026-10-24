import { Link } from 'react-router-dom'
import { PageHeader, Badge, Button, DataTable, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { mock } from '../../api/mock.js'
import { money, fmtDateTime, label } from '../../utils/format.js'

export default function Payments() {
  const { data, loading, error, reload } = useAsync(() => mock.payments.list())
  const columns = [
    { key: 'id', header: 'Payment', render: (p) => <><div className="cell-title">{p.id}</div><div className="cell-sub">{fmtDateTime(p.createdAt)}</div></> },
    { key: 'desc', header: 'Description', render: (p) => p.description },
    { key: 'method', header: 'Method', render: (p) => label(p.method) },
    { key: 'amount', header: 'Amount', render: (p) => money(p.amount) },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
    { key: 'actions', header: '', className: 'actions', render: (p) => <Button as={Link} to={`/account/reservations/${p.reservationId}`} size="sm" variant="secondary">Reservation</Button> },
  ]
  return (
    <>
      <PageHeader title="Payments" subtitle="Your payment history." />
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> :
        <DataTable columns={columns} rows={data} rowKey="id" empty={<EmptyState title="No payments yet" />} />}
    </>
  )
}

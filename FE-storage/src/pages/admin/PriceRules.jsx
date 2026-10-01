import { useState } from 'react'
import { Plus, Pencil, Ban, History } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { numOrNull, orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, PRICE_TYPES, CALC_TYPES } from '../../api/client.js'

const EMPTY = { facilityId: '', unitTypeId: '', priceType: 'RENTAL', calculationType: 'PER_MONTH', amount: '', percentage: '', effectiveFrom: '', effectiveTo: '' }
const label = (s) => s.replace(/_/g, ' ')
const money = (n) => Number(n).toLocaleString('en-US')

export default function PriceRules() {
  const toast = useToast()
  const rules = useAsync(() => api.priceRules.list())
  const facilities = useAsync(() => api.facilities.list())
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [historyOf, setHistoryOf] = useState(null)
  const history = useAsync(() => (historyOf
    ? api.priceRules.history({ priceType: historyOf.priceType, facilityId: historyOf.facilityId ?? undefined, unitTypeId: historyOf.unitTypeId ?? undefined })
    : Promise.resolve([])), [historyOf])
  const formTypes = useAsync(() => (form.facilityId ? api.unitTypes.listByFacility(form.facilityId) : Promise.resolve([])), [form.facilityId])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const isPct = form.calculationType === 'PERCENTAGE'
  const facName = (id) => facilities.data?.find((f) => f.id === id)?.name || `#${id}`

  const openForm = (r) => {
    setEditing(r || 'new')
    setForm(r ? {
      facilityId: r.facilityId ?? '', unitTypeId: r.unitTypeId ?? '', priceType: r.priceType, calculationType: r.calculationType,
      amount: r.amount ?? '', percentage: r.percentage ?? '', effectiveFrom: r.effectiveFrom || '', effectiveTo: r.effectiveTo || '',
    } : EMPTY)
  }

  const save = async () => {
    const body = {
      facilityId: numOrNull(form.facilityId), unitTypeId: numOrNull(form.unitTypeId),
      priceType: form.priceType, calculationType: form.calculationType,
      amount: isPct ? null : numOrNull(form.amount), percentage: isPct ? numOrNull(form.percentage) : null,
      effectiveFrom: form.effectiveFrom, effectiveTo: orNull(form.effectiveTo),
    }
    if (editing === 'new') await api.priceRules.create(body)
    else await api.priceRules.update(editing.id, body)
    toast(editing === 'new' ? 'Price rule created' : 'Price rule updated')
    setEditing(null); rules.reload()
  }
  const disable = async () => {
    setBusy(true)
    try { await api.priceRules.disable(disabling.id); toast('Price rule disabled'); setDisabling(null); rules.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const historyColumns = [
    { key: 'value', header: 'Value', render: (r) => r.calculationType === 'PERCENTAGE' ? `${r.percentage}%` : money(r.amount) },
    { key: 'period', header: 'Effective', render: (r) => `${r.effectiveFrom} → ${r.effectiveTo || 'open'}` },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ]

  const columns = [
    { key: 'type', header: 'Rule', render: (r) => <><div className="cell-title">{label(r.priceType)}</div><div className="cell-sub">{label(r.calculationType)}</div></> },
    { key: 'value', header: 'Value', render: (r) => r.calculationType === 'PERCENTAGE' ? `${r.percentage}%` : money(r.amount) },
    { key: 'scope', header: 'Scope', render: (r) => r.facilityId ? <>{facName(r.facilityId)}{r.unitTypeId && <div className="cell-sub">Unit type #{r.unitTypeId}</div>}</> : 'System-wide' },
    { key: 'period', header: 'Effective', render: (r) => `${r.effectiveFrom} → ${r.effectiveTo || 'open'}` },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', header: '', className: 'actions', render: (r) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => setHistoryOf(r)}><History size={14} /> History</Button>
        <Button size="sm" variant="secondary" onClick={() => openForm(r)}><Pencil size={14} /> Edit</Button>
        {r.active && <Button size="sm" variant="danger-outline" onClick={() => setDisabling(r)}><Ban size={14} /> Disable</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Price Rules" subtitle="Rental, deposit and fee rules."
        actions={<Button onClick={() => openForm()}><Plus size={18} /> New rule</Button>} />
      {rules.loading ? <LoadingState /> : rules.error ? <ErrorState error={rules.error} onRetry={rules.reload} /> :
        <DataTable columns={columns} rows={rules.data} rowKey="id" empty={<EmptyState title="No price rules" message="Create a rule to define pricing." />} />}

      <FormModal wide open={!!editing} title={editing === 'new' ? 'New price rule' : 'Edit price rule'} onClose={() => setEditing(null)} onSubmit={save}>
        <Select label="Price type" value={form.priceType} onChange={set('priceType')}>{PRICE_TYPES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        <Select label="Calculation" value={form.calculationType} onChange={set('calculationType')}>{CALC_TYPES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        {isPct
          ? <Input label="Percentage" type="number" min="0" step="0.01" required value={form.percentage} onChange={set('percentage')} />
          : <Input label="Amount" type="number" min="0" step="0.01" required value={form.amount} onChange={set('amount')} />}
        <div />
        <Select label="Facility" hint="Leave empty for system-wide" value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value, unitTypeId: '' })}>
          <option value="">System-wide</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select label="Unit type" hint="Optional" value={form.unitTypeId} onChange={set('unitTypeId')} disabled={!form.facilityId}>
          <option value="">Any unit type</option>
          {formTypes.data?.map((t) => <option key={t.id} value={t.id}>{t.typeName}</option>)}
        </Select>
        <Input label="Effective from" type="date" required value={form.effectiveFrom} onChange={set('effectiveFrom')} />
        <Input label="Effective to" type="date" value={form.effectiveTo} onChange={set('effectiveTo')} />
      </FormModal>

      <Modal wide open={!!historyOf} title={historyOf ? `History: ${label(historyOf.priceType)}` : ''} onClose={() => setHistoryOf(null)}>
        {history.loading ? <LoadingState /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> :
          <DataTable columns={historyColumns} rows={history.data} rowKey="id" pageSize={5} empty={<EmptyState title="No history" />} />}
      </Modal>

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Disable price rule" confirmText="Disable"
        message="Disable this price rule? It will no longer be applied." onConfirm={disable} onClose={() => setDisabling(null)} />
    </>
  )
}

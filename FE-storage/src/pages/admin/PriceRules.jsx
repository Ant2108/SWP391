import { useState } from 'react'
import { Plus, Pencil, Ban, History, Trash2 } from 'lucide-react'
import { PageHeader, Button, Badge, DataTable, Input, Select, ConfirmDialog, Modal, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import FormModal, { numOrNull, orNull } from '../../components/FormModal.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { useAuth } from '../../hooks/useAuth.jsx'
import { canWrite } from '../../utils/permissions.js'
import { api, PRICE_TYPES, CALC_TYPES } from '../../api/client.js'
import { money as vnd, fmtDate, unitTypeLabel } from '../../utils/format.js'

const EMPTY_FILTERS = { q: '', facility: '', unitType: '', priceType: '', status: '' }
// Ngày hôm nay theo giờ máy (không dùng toISOString vì lệch múi giờ).
const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const EMPTY = { facilityId: '', unitTypeId: '', priceType: 'RENTAL', calculationType: 'PER_MONTH', amount: '', percentage: '', effectiveFrom: '', effectiveTo: '' }
const PRICE_VI = { RENTAL: 'Giá thuê', RENEWAL: 'Giá gia hạn', OVERDUE: 'Phí quá hạn (mỗi ngày)', EXTRA_FEE: 'Phụ phí', DAMAGE_FEE: 'Phí hư hại', DEPOSIT: 'Tiền cọc', DISCOUNT: 'Giảm giá' }
const CALC_VI = { FIXED: 'Số tiền cố định', PER_DAY: 'Theo ngày', PER_MONTH: 'Theo tháng', PERCENTAGE: 'Theo phần trăm' }
const label = (s) => PRICE_VI[s] || CALC_VI[s] || String(s).replace(/_/g, ' ')
const money = (n) => vnd(n)
const to = (d) => (d ? fmtDate(d) : 'không giới hạn')

export default function PriceRules() {
  const toast = useToast()
  const { user } = useAuth()
  const canEdit = canWrite(user?.role, 'priceRules')
  // Facility Manager: chỉ giá thuê (RENTAL) của một cơ sở cụ thể. Business Manager: mọi loại giá, kể cả toàn hệ thống.
  const isFm = user?.role === 'FACILITY_MANAGER'
  const priceTypes = isFm ? ['RENTAL'] : PRICE_TYPES
  const canManage = (r) => canEdit && (!isFm || (r.priceType === 'RENTAL' && r.facilityId != null))
  const rules = useAsync(() => api.priceRules.list())
  const facilities = useAsync(() => api.facilities.list())
  // Mọi loại kho có trong hệ thống (gom từ tất cả cơ sở), để lọc bảng giá theo loại.
  const allTypes = useAsync(async () => {
    const list = await api.facilities.list()
    const per = await Promise.all(list.map((f) => api.unitTypes.listByFacility(f.id).catch(() => [])))
    return per.flat()
  }, [])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [disabling, setDisabling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [busy, setBusy] = useState(false)
  const [historyOf, setHistoryOf] = useState(null)
  const history = useAsync(() => (historyOf
    ? api.priceRules.history({ priceType: historyOf.priceType, facilityId: historyOf.facilityId ?? undefined, unitTypeId: historyOf.unitTypeId ?? undefined })
    : Promise.resolve([])), [historyOf])
  const formTypes = useAsync(() => (form.facilityId ? api.unitTypes.listByFacility(form.facilityId) : Promise.resolve([])), [form.facilityId])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value, ...(k === 'priceType' && e.target.value === 'DEPOSIT' ? { calculationType: 'PERCENTAGE' } : {}) })
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
    if (isFm && !form.facilityId) throw new Error('Vui lòng chọn cơ sở của bạn.')
    const value = isPct ? form.percentage : form.amount
    if (value !== '' && Number(value) < 0) throw new Error(`${isPct ? 'Phần trăm' : 'Số tiền'} không được âm.`)
    if (isPct && form.priceType === 'DISCOUNT' && Number(form.percentage) > 100) throw new Error('Giảm giá không được vượt quá 100%.')
    const body = {
      facilityId: numOrNull(form.facilityId), unitTypeId: numOrNull(form.unitTypeId),
      priceType: form.priceType, calculationType: form.calculationType,
      amount: isPct ? null : numOrNull(form.amount), percentage: isPct ? numOrNull(form.percentage) : null,
      effectiveFrom: form.effectiveFrom, effectiveTo: orNull(form.effectiveTo),
    }
    if (editing === 'new') await api.priceRules.create(body)
    else await api.priceRules.update(editing.id, body)
    toast(editing === 'new' ? 'Đã tạo luật giá' : 'Đã cập nhật luật giá')
    setEditing(null); rules.reload()
  }
  const disable = async () => {
    setBusy(true)
    try { await api.priceRules.disable(disabling.id); toast('Đã vô hiệu hóa luật giá'); setDisabling(null); rules.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try { await api.priceRules.remove(deleting.id); toast('Đã xóa luật giá'); setDeleting(null); rules.reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const baseRules = (rules.data || []).filter((r) => r.priceType !== 'DEPOSIT' || r.calculationType === 'PERCENTAGE')
  const today = localToday()
  const unitTypeNames = [...new Set([...(allTypes.data || []).map((t) => t.typeName), ...baseRules.map((r) => r.unitTypeName).filter(Boolean)])]
    .sort((a, b) => unitTypeLabel(a).localeCompare(unitTypeLabel(b), 'vi'))
  const visible = baseRules.filter((r) => {
    if (filters.facility === 'SYSTEM' && r.facilityId != null) return false
    if (filters.facility && filters.facility !== 'SYSTEM' && String(r.facilityId) !== filters.facility) return false
    if (filters.unitType === 'ANY' && r.unitTypeId != null) return false
    if (filters.unitType && filters.unitType !== 'ANY' && r.unitTypeName !== filters.unitType) return false
    if (filters.priceType && r.priceType !== filters.priceType) return false
    if (filters.status === 'CURRENT' && !(r.active && r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today))) return false
    if (filters.status === 'ACTIVE' && !r.active) return false
    if (filters.status === 'INACTIVE' && r.active) return false
    const q = filters.q.trim().toLowerCase()
    if (q) {
      const hay = [r.facilityName, r.unitTypeName && unitTypeLabel(r.unitTypeName), label(r.priceType), label(r.calculationType), r.amount, r.percentage]
        .filter((v) => v != null).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  const historyColumns = [
    { key: 'value', header: 'Giá trị', render: (r) => r.calculationType === 'PERCENTAGE' ? `${r.percentage}%` : money(r.amount) },
    { key: 'period', header: 'Hiệu lực', render: (r) => `${fmtDate(r.effectiveFrom)} → ${to(r.effectiveTo)}` },
    { key: 'status', header: 'Trạng thái', render: (r) => <Badge status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
  ]

  const columns = [
    { key: 'type', header: 'Luật', render: (r) => <><div className="cell-title">{label(r.priceType)}</div><div className="cell-sub">{label(r.calculationType)}</div></> },
    { key: 'value', header: 'Giá trị', render: (r) => r.calculationType === 'PERCENTAGE' ? `${r.percentage}%` : money(r.amount) },
    { key: 'scope', header: 'Phạm vi', render: (r) => r.facilityId ? <>{r.facilityName || facName(r.facilityId)}<div className="cell-sub">{r.unitTypeName ? `Loại kho: ${unitTypeLabel(r.unitTypeName)}` : 'Mọi loại kho'}</div></> : 'Toàn hệ thống' },
    { key: 'period', header: 'Hiệu lực', render: (r) => `${fmtDate(r.effectiveFrom)} → ${to(r.effectiveTo)}` },
    { key: 'status', header: 'Trạng thái', render: (r) => <Badge status={r.active ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', header: '', className: 'actions', render: (r) => (
      <>
        <Button size="sm" variant="secondary" onClick={() => setHistoryOf(r)}><History size={14} /> Lịch sử</Button>
        {canManage(r) && <Button size="sm" variant="secondary" onClick={() => openForm(r)}><Pencil size={14} /> Sửa</Button>}
        {canManage(r) && r.active && <Button size="sm" variant="secondary" onClick={() => setDisabling(r)}><Ban size={14} /> Vô hiệu hóa</Button>}
        {canManage(r) && <Button size="sm" variant="danger-outline" onClick={() => setDeleting(r)}><Trash2 size={14} /> Xóa</Button>}
      </>) },
  ]

  return (
    <>
      <PageHeader title="Bảng giá" subtitle="Giá thuê theo tháng, giá gia hạn, phí quá hạn, phụ phí và giảm giá. Tiền cọc mặc định 50% tổng tiền thuê (có thể đặt % khác bằng luật Tiền cọc)."
        actions={canEdit && <Button onClick={() => openForm()}><Plus size={18} /> Thêm luật giá</Button>} />
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Input label="Tìm kiếm" placeholder="Cơ sở, loại kho, loại giá, số tiền…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Select label="Cơ sở" value={filters.facility} onChange={(e) => setFilters({ ...filters, facility: e.target.value })}>
            <option value="">Tất cả cơ sở</option>
            <option value="SYSTEM">Toàn hệ thống</option>
            {facilities.data?.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
          </Select>
          <Select label="Loại kho" value={filters.unitType} onChange={(e) => setFilters({ ...filters, unitType: e.target.value })}>
            <option value="">Tất cả loại kho</option>
            <option value="ANY">Luật không gắn loại kho (áp cả cơ sở)</option>
            {unitTypeNames.map((n) => <option key={n} value={n}>{unitTypeLabel(n)}</option>)}
          </Select>
          <Select label="Loại giá" value={filters.priceType} onChange={(e) => setFilters({ ...filters, priceType: e.target.value })}>
            <option value="">Tất cả loại giá</option>
            {priceTypes.filter((p) => p !== 'DEPOSIT' || !isFm).map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </Select>
          <Select label="Trạng thái" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tất cả</option>
            <option value="CURRENT">Đang áp dụng hôm nay</option>
            <option value="ACTIVE">Đang bật</option>
            <option value="INACTIVE">Đã vô hiệu hóa</option>
          </Select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <span className="muted small">Hiển thị {visible.length} / {baseRules.length} luật</span>
          {filtering && <Button size="sm" variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Xóa bộ lọc</Button>}
        </div>
      </div>
      {rules.loading ? <LoadingState /> : rules.error ? <ErrorState error={rules.error} onRetry={rules.reload} /> :
        <DataTable columns={columns} rows={visible} rowKey="id" empty={filtering
          ? <EmptyState title="Không có luật giá phù hợp" message="Thử đổi hoặc xóa bộ lọc." />
          : <EmptyState title="Chưa có luật giá" message="Hãy tạo luật giá để thiết lập giá thuê và các loại phí." />} />}

      <FormModal wide open={!!editing} title={editing === 'new' ? 'Thêm luật giá' : 'Sửa luật giá'} onClose={() => setEditing(null)} onSubmit={save}>
        <div className="span-2 muted" style={{ fontSize: 13.5, marginTop: -6 }}>
          Mỗi phạm vi (cơ sở + loại kho) chỉ có một luật cùng loại tại một thời điểm. Muốn đổi giá, hãy vô hiệu hóa luật cũ hoặc đặt ngày hiệu lực nối tiếp.
        </div>
        <Select label="Loại giá" value={form.priceType} onChange={set('priceType')}>{priceTypes.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        <Select label="Cách tính" value={form.calculationType} onChange={set('calculationType')}>{(form.priceType === 'DEPOSIT' ? ['PERCENTAGE'] : CALC_TYPES).map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select>
        {isPct
          ? <Input label="Phần trăm" type="number" min="0" max={form.priceType === 'DISCOUNT' ? 100 : undefined} step="0.01" required value={form.percentage} onChange={set('percentage')} />
          : <Input label="Số tiền" type="number" min="0" step="0.01" required value={form.amount} onChange={set('amount')} />}
        <div />
        <Select label="Cơ sở kho" required={isFm} hint={isFm ? 'Bắt buộc: bạn chỉ đặt được giá thuê cho cơ sở của mình' : 'Để trống nếu áp dụng toàn hệ thống'} value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value, unitTypeId: '' })}>
          <option value="">{isFm ? 'Chọn cơ sở' : 'Toàn hệ thống'}</option>
          {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Select label="Loại kho" hint="Không bắt buộc" value={form.unitTypeId} onChange={set('unitTypeId')} disabled={!form.facilityId}>
          <option value="">Mọi loại kho</option>
          {formTypes.data?.map((t) => <option key={t.id} value={t.id}>{unitTypeLabel(t.typeName)}</option>)}
        </Select>
        <Input label="Có hiệu lực từ" type="date" required value={form.effectiveFrom} onChange={set('effectiveFrom')} />
        <Input label="Có hiệu lực đến" type="date" value={form.effectiveTo} onChange={set('effectiveTo')} />
      </FormModal>

      <Modal wide open={!!historyOf} title={historyOf ? `Lịch sử: ${label(historyOf.priceType)}` : ''} onClose={() => setHistoryOf(null)}>
        {history.loading ? <LoadingState /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> :
          <DataTable columns={historyColumns} rows={history.data} rowKey="id" pageSize={5} empty={<EmptyState title="Chưa có lịch sử" />} />}
      </Modal>

      <ConfirmDialog open={!!deleting} danger loading={busy} title="Xóa luật giá" confirmText="Xóa"
        message="Xóa hẳn luật giá này? Hành động này không thể hoàn tác. Nếu chỉ muốn ngừng áp dụng, hãy chọn Vô hiệu hóa." onConfirm={remove} onClose={() => setDeleting(null)} />

      <ConfirmDialog open={!!disabling} danger loading={busy} title="Vô hiệu hóa luật giá" confirmText="Vô hiệu hóa"
        message="Vô hiệu hóa luật giá này? Luật sẽ không còn được áp dụng." onConfirm={disable} onClose={() => setDisabling(null)} />
    </>
  )
}

import { useState } from 'react'
import { Download, TrendingUp, Gauge, FileText, Wallet } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, DataTable, LoadingState, ErrorState, EmptyState } from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { api } from '../../api/client.js'
import { money, label, unitTypeLabel } from '../../utils/format.js'

// Ngày theo GIỜ MÁY (không dùng toISOString vì lệch múi giờ UTC).
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthStart = () => { const d = new Date(); d.setDate(1); return iso(d) }

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

export default function Reports() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(iso(new Date()))
  const [facilityId, setFacilityId] = useState('')
  const facilities = useAsync(() => api.facilities.list())
  const { data, loading, error, reload } = useAsync(
    () => api.reports.summary({ from: from || undefined, to: to || undefined, facilityId: facilityId || undefined }),
    [from, to, facilityId],
  )

  const t = data?.totals
  const exportCsv = () => {
    const head = ['Cơ sở', 'Trạng thái', 'Tổng ô', 'Còn trống', 'Đã giữ chỗ', 'Đang thuê', 'Bảo trì/kiểm tra', 'Tỷ lệ sử dụng (%)',
      'HĐ chờ nhận kho', 'HĐ đang thuê', 'HĐ quá hạn', 'HĐ hoàn tất', 'Doanh thu thuê', 'Doanh thu phí', 'Tổng doanh thu',
      'Cọc đã thu', 'Cọc đã hoàn', 'Cọc giữ lại', 'Phí đã miễn']
    const line = (name, status, r) => [name, status, r.totalUnits, r.availableUnits, r.reservedUnits, r.occupiedUnits, r.unavailableUnits,
      r.occupancyRate, r.pendingContracts, r.activeContracts, r.overdueContracts, r.completedContracts, r.rentalRevenue, r.feeRevenue,
      r.totalRevenue, r.depositsCollected, r.depositsRefunded, r.depositsRetained, r.feesWaived]
    const rows = [
      [`Báo cáo từ ${from} đến ${to}`], [],
      ['THEO CƠ SỞ'], head,
      ...(data?.facilities || []).map((f) => line(f.facilityName, label(f.facilityStatus), f.data)),
      line('TỔNG', '', t),
      [], ['THEO LOẠI KHO'],
      ['Loại kho', 'Tổng ô', 'Đang thuê', 'Đã giữ chỗ', 'Còn trống', 'Tỷ lệ sử dụng (%)', 'Doanh thu'],
      ...(data?.unitTypes || []).map((u) => [unitTypeLabel(u.unitTypeName), u.totalUnits, u.occupiedUnits, u.reservedUnits, u.availableUnits, u.occupancyRate, u.totalRevenue]),
    ]
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bao-cao-${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const facilityCols = [
    { key: 'name', header: 'Cơ sở', render: (f) => <><div className="cell-title">{f.facilityName}</div><div className="cell-sub">{label(f.facilityStatus)}</div></> },
    { key: 'units', header: 'Ô kho', render: (f) => `${f.data.occupiedUnits + f.data.reservedUnits} / ${f.data.totalUnits}` },
    { key: 'rate', header: 'Tỷ lệ sử dụng', render: (f) => `${f.data.occupancyRate}%` },
    { key: 'contracts', header: 'Hợp đồng (chờ / thuê / quá hạn / xong)', render: (f) => `${f.data.pendingContracts} / ${f.data.activeContracts} / ${f.data.overdueContracts} / ${f.data.completedContracts}` },
    { key: 'rent', header: 'Doanh thu thuê', render: (f) => money(f.data.rentalRevenue) },
    { key: 'fee', header: 'Doanh thu phí', render: (f) => money(f.data.feeRevenue) },
    { key: 'total', header: 'Tổng doanh thu', render: (f) => <strong>{money(f.data.totalRevenue)}</strong> },
  ]
  const typeCols = [
    { key: 'name', header: 'Loại kho', render: (u) => <strong>{unitTypeLabel(u.unitTypeName)}</strong> },
    { key: 'units', header: 'Tổng ô', render: (u) => u.totalUnits },
    { key: 'occ', header: 'Đang thuê', render: (u) => u.occupiedUnits },
    { key: 'res', header: 'Đã giữ chỗ', render: (u) => u.reservedUnits },
    { key: 'av', header: 'Còn trống', render: (u) => u.availableUnits },
    { key: 'rate', header: 'Tỷ lệ sử dụng', render: (u) => `${u.occupancyRate}%` },
    { key: 'rev', header: 'Doanh thu', render: (u) => <strong>{money(u.totalRevenue)}</strong> },
  ]

  return (
    <>
      <PageHeader title="Báo cáo" subtitle="Doanh thu, tỷ lệ sử dụng kho và tình hình hợp đồng theo cơ sở và loại kho."
        actions={<Button variant="secondary" onClick={exportCsv} disabled={!data}><Download size={16} /> Xuất Excel (CSV)</Button>} />
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Input label="Doanh thu từ ngày" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Đến ngày" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          <Select label="Cơ sở" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            <option value="">Tất cả cơ sở</option>
            {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="grid grid-4">
            <Card className="stat-card"><div className="stat-label"><TrendingUp size={18} /> Tổng doanh thu</div><div className="stat-num" style={{ fontSize: 24 }}>{money(t.totalRevenue)}</div>
              <div className="muted small">Thuê {money(t.rentalRevenue)} · Phí {money(t.feeRevenue)} · Đã miễn {money(t.feesWaived)}</div></Card>
            <Card className="stat-card"><div className="stat-label"><Gauge size={18} /> Tỷ lệ sử dụng kho</div><div className="stat-num">{t.occupancyRate}%</div>
              <div className="muted small">{t.occupiedUnits + t.reservedUnits} / {t.totalUnits} ô đang thuê hoặc giữ chỗ</div></Card>
            <Card className="stat-card"><div className="stat-label"><FileText size={18} /> Hợp đồng đang thuê</div><div className="stat-num">{t.activeContracts}</div>
              <div className="muted small">Chờ nhận kho {t.pendingContracts} · Quá hạn {t.overdueContracts}</div></Card>
            <Card className="stat-card"><div className="stat-label"><Wallet size={18} /> Tiền cọc</div><div className="stat-num" style={{ fontSize: 24 }}>{money(t.depositsCollected)}</div>
              <div className="muted small">Đã hoàn {money(t.depositsRefunded)} · Giữ lại {money(t.depositsRetained)}</div></Card>
          </div>
          <h3 style={{ margin: '28px 0 12px' }}>Theo cơ sở</h3>
          <DataTable columns={facilityCols} rows={data.facilities} rowKey="facilityId" pageSize={25} empty={<EmptyState title="Chưa có dữ liệu" />} />
          <h3 style={{ margin: '28px 0 12px' }}>Theo loại kho</h3>
          <DataTable columns={typeCols} rows={data.unitTypes} rowKey="unitTypeName" empty={<EmptyState title="Chưa có dữ liệu" />} />
          <p className="muted small" style={{ marginTop: 14 }}>Tiền cọc không tính vào doanh thu. Cọc giữ lại là phần công ty không hoàn do khách hủy muộn hoặc bị khấu trừ khi trả kho.</p>
        </>
      )}
    </>
  )
}

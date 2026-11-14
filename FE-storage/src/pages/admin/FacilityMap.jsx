import { useState } from 'react'
import {
  Layers,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Package,
  Wrench,
  User,
  Ruler,
  Calendar,
  Plus,
  RefreshCw,
  Building2,
} from 'lucide-react'
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Input,
  Select,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/ui.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useToast } from '../../hooks/useToast.jsx'
import { api, NEXT_UNIT_STATUSES } from '../../api/client.js'
import { label, money, unitTypeLabel } from '../../utils/format.js'

export default function FacilityMap() {
  const toast = useToast()

  const [selectedFacilityId, setSelectedFacilityId] = useState('')
  const [selectedFloor, setSelectedFloor] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [statusChangeModal, setStatusChangeModal] = useState(null)
  const [targetStatus, setTargetStatus] = useState('MAINTENANCE')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Facilities list
  const facilities = useAsync(() => api.facilities.list('ACTIVE'))

  // Auto select first facility
  const activeFacilityId = selectedFacilityId || facilities.data?.[0]?.id || ''

  // Units and Unit Types for selected facility
  const { data, loading, error, reload } = useAsync(async () => {
    if (!activeFacilityId) return { units: [], types: [] }
    const [units, types] = await Promise.all([
      api.storageUnits.search({ facilityId: activeFacilityId }),
      api.unitTypes.listByFacility(activeFacilityId),
    ])
    return { units, types }
  }, [activeFacilityId])

  const units = data?.units || []
  const types = data?.types || []

  // Unique floors
  const floors = Array.from(new Set(units.map((u) => u.floor).filter(Boolean))).sort((a, b) => a - b)

  // Filtered units
  const filteredUnits = units.filter((u) => {
    if (selectedFloor !== 'ALL' && String(u.floor) !== String(selectedFloor)) return false
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false
    if (typeFilter !== 'ALL' && String(u.unitTypeId) !== typeFilter) return false
    if (searchQuery.trim() && !u.unitCode.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Summary counts
  const availableCount = units.filter((u) => u.status === 'AVAILABLE').length
  const occupiedCount = units.filter((u) => u.status === 'OCCUPIED').length
  const reservedCount = units.filter((u) => u.status === 'RESERVED').length
  const maintenanceCount = units.filter((u) => u.status === 'MAINTENANCE').length
  const occupancyRate = units.length ? Math.round(((occupiedCount + reservedCount) / units.length) * 100) : 0

  // Status color mapper
  const getStatusBg = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return '#DCFCE7'
      case 'OCCUPIED':
        return '#F1F5F9'
      case 'RESERVED':
        return '#FEF3C7'
      case 'MAINTENANCE':
        return '#FEE2E2'
      default:
        return '#F8FAFC'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return '#15803D'
      case 'OCCUPIED':
        return '#475569'
      case 'RESERVED':
        return '#D97706'
      case 'MAINTENANCE':
        return '#DC2626'
      default:
        return '#202124'
    }
  }

  // Handle status change (e.g. mark maintenance or make available)
  const handleChangeStatus = async () => {
    if (!statusChangeModal) return
    setUpdatingStatus(true)
    try {
      await api.storageUnits.changeStatus(statusChangeModal.id, targetStatus)
      toast(`Ô ${statusChangeModal.unitCode} đã chuyển sang: ${label(targetStatus)}`)
      setStatusChangeModal(null)
      setSelectedUnit(null)
      reload()
    } catch (err) {
      toast(err.message || 'Đổi trạng thái thất bại', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Sơ đồ cơ sở tương tác"
        subtitle="Mặt bằng cơ sở trực quan để xem các ô kho, theo dõi tỷ lệ sử dụng và quản lý bảo trì."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Select
              value={activeFacilityId}
              onChange={(e) => setSelectedFacilityId(Number(e.target.value))}
              style={{ minWidth: 240 }}
            >
              {(facilities.data || []).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={reload}>
              <RefreshCw size={16} /> Làm mới
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <Card className="stat-card">
          <div className="stat-label"><Package size={18} color="#202124" /> Tổng số ô kho</div>
          <div className="stat-num">{units.length} ô</div>
          <div className="field-hint">Trên {floors.length || 1} tầng</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label"><CheckCircle2 size={18} color="#15803D" /> Ô kho còn trống</div>
          <div className="stat-num" style={{ color: '#15803D' }}>{availableCount}</div>
          <div className="field-hint">Trống và sẵn sàng cho thuê</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label"><Layers size={18} color="#D97706" /> Đang thuê / Đã giữ chỗ</div>
          <div className="stat-num">{occupiedCount + reservedCount}</div>
          <div className="field-hint">{occupiedCount} đang thuê · {reservedCount} đã giữ chỗ</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-label"><Building2 size={18} color="#E5A900" /> Tỷ lệ sử dụng</div>
          <div className="stat-num">{occupancyRate}%</div>
          <div className="field-hint">{maintenanceCount} ô đang bảo trì</div>
        </Card>
      </div>

      {/* Controls & Filter Bar */}
      <Card style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Input
            placeholder="Tìm theo mã ô kho (ví dụ A-101)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <Select value={selectedFloor} onChange={(e) => setSelectedFloor(e.target.value)}>
            <option value="ALL">Tất cả các tầng</option>
            {floors.map((fl) => (
              <option key={fl} value={fl}>Tầng {fl}</option>
            ))}
          </Select>

          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Tất cả loại kho</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{unitTypeLabel(t.typeName)}</option>
            ))}
          </Select>

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Tất cả trạng thái ({units.length})</option>
            <option value="AVAILABLE">Còn trống ({availableCount})</option>
            <option value="RESERVED">Đã giữ chỗ ({reservedCount})</option>
            <option value="OCCUPIED">Đang thuê ({occupiedCount})</option>
            <option value="MAINTENANCE">Bảo trì ({maintenanceCount})</option>
          </Select>
        </div>
      </Card>

      {/* Visual Floor Plan Grid Map */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedUnit ? '1fr 340px' : '1fr', gap: 20 }}>
        <Card style={{ padding: 24, minHeight: 460 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0 }}>Mặt bằng cơ sở và vị trí các ô kho</h3>
              <p className="muted small" style={{ marginTop: 4 }}>
                Đang hiển thị {filteredUnits.length} ô kho. Bấm vào một ô để xem chi tiết hoặc đổi trạng thái.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#DCFCE7', border: '1px solid #86EFAC' }} /> Còn trống
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FEF3C7', border: '1px solid #FCD34D' }} /> Đã giữ chỗ
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F1F5F9', border: '1px solid #CBD5E1' }} /> Đang thuê
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FEE2E2', border: '1px solid #FCA5A5' }} /> Bảo trì
              </span>
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !filteredUnits.length ? (
            <EmptyState title="Không tìm thấy ô kho" message="Thử chọn tầng hoặc trạng thái khác." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: 12,
              }}
            >
              {filteredUnits.map((u) => {
                const isSelected = selectedUnit?.id === u.id
                const unitType = types.find((t) => t.id === u.unitTypeId)

                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUnit(u)}
                    style={{
                      background: getStatusBg(u.status),
                      border: isSelected ? '2px solid #202124' : `1px solid ${getStatusColor(u.status)}33`,
                      borderRadius: 12,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'all 0.18s ease',
                      boxShadow: isSelected ? '0 4px 14px rgba(0,0,0,0.12)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 15, color: '#202124' }}>{u.unitCode}</strong>
                      <span style={{ fontSize: 11, fontWeight: 600, color: getStatusColor(u.status) }}>
                        F{u.floor || 1}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {unitType?.typeName ? unitTypeLabel(unitType.typeName) : 'Loại kho tiêu chuẩn'}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: getStatusColor(u.status), marginTop: 2 }}>
                      {label(u.status)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Selected Unit Inspection Drawer */}
        {selectedUnit && (
          <Card style={{ padding: 22, height: 'fit-content', border: '1px solid #CBD5E1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 2 }}>CHI TIẾT Ô KHO</span>
                <h3 style={{ margin: 0 }}>Ô {selectedUnit.unitCode}</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedUnit(null)}
                style={{ cursor: 'pointer', border: 0, background: 'none' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10, fontSize: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Trạng thái:</span>
                <Badge status={selectedUnit.status} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Tầng:</span>
                <strong>Tầng {selectedUnit.floor || 1}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Vị trí:</span>
                <span>{selectedUnit.location || 'Lối đi chính'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Loại kho:</span>
                <strong>{unitTypeLabel(types.find((t) => t.id === selectedUnit.unitTypeId)?.typeName) || 'Tiêu chuẩn'}</strong>
              </div>
              {selectedUnit.price && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Giá thuê:</span>
                  <strong>{money(selectedUnit.price)}/tháng</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {(NEXT_UNIT_STATUSES[selectedUnit.status] || []).includes('MAINTENANCE') ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStatusChangeModal(selectedUnit)
                    setTargetStatus('MAINTENANCE')
                  }}
                >
                  <Wrench size={16} /> Chuyển sang bảo trì
                </Button>
              ) : (NEXT_UNIT_STATUSES[selectedUnit.status] || []).includes('AVAILABLE') ? (
                <Button
                  onClick={() => {
                    setStatusChangeModal(selectedUnit)
                    setTargetStatus('AVAILABLE')
                  }}
                >
                  <CheckCircle2 size={16} /> Đưa về còn trống
                </Button>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>Ô kho đang có đơn đặt hoặc hợp đồng nên không đổi trạng thái thủ công được.</p>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Status Change Confirmation Modal */}
      <Modal
        open={!!statusChangeModal}
        title={`Đổi trạng thái ô ${statusChangeModal?.unitCode || ''}`}
        onClose={() => setStatusChangeModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusChangeModal(null)}>Hủy bỏ</Button>
            <Button loading={updatingStatus} onClick={handleChangeStatus}>Xác nhận</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <p>
            Bạn chắc chắn muốn chuyển ô <strong>{statusChangeModal?.unitCode}</strong> sang trạng thái <strong>{label(targetStatus)}</strong>?
          </p>
          <Select label="Trạng thái mới" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
            {(NEXT_UNIT_STATUSES[statusChangeModal?.status] || [targetStatus]).map((st) => <option key={st} value={st}>{label(st)}</option>)}
          </Select>
        </div>
      </Modal>
    </>
  )
}

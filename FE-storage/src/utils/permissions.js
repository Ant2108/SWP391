// Khớp @PreAuthorize ở BE: ai được ghi (tạo/sửa/vô hiệu hóa) từng loại dữ liệu. Ai cũng đọc được khi đã đăng nhập.
const WRITE = {
  facilities: ['FACILITY_MANAGER', 'BUSINESS_MANAGER'],
  unitTypes: ['FACILITY_MANAGER'],
  storageUnits: ['FACILITY_MANAGER'],
  priceRules: ['FACILITY_MANAGER', 'BUSINESS_MANAGER'],
}

export const canWrite = (role, resource) => WRITE[resource]?.includes(role) ?? false

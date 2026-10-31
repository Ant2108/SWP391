// Khớp @PreAuthorize ở BE: ai được ghi (tạo/sửa/vô hiệu hóa) từng loại dữ liệu. Ai cũng đọc được khi đã đăng nhập.
// Lưu ý: FACILITY_MANAGER chỉ thao tác được trên cơ sở được phân công; việc đó BE kiểm tra (403), FE không biết cơ sở của họ.
const WRITE = {
  facilitiesCreate: ['BUSINESS_MANAGER'], // tạo mới và vô hiệu hóa cơ sở
  facilitiesEdit: ['FACILITY_MANAGER', 'BUSINESS_MANAGER'], // sửa thông tin cơ sở
  unitTypes: ['FACILITY_MANAGER'],
  storageUnits: ['FACILITY_MANAGER'],
  priceRules: ['FACILITY_MANAGER', 'BUSINESS_MANAGER'],
}

export const canWrite = (role, resource) => WRITE[resource]?.includes(role) ?? false

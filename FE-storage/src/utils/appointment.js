// Trạng thái hiển thị của lịch nhận kho (BE tính sẵn ở displayStatus): chưa trả cọc đợt 1 -> đang giữ kho -> đã check-in.
const DISPLAY = {
  NOT_PAID: { text: 'Chưa đóng cọc', tone: 'yellow' },
  HOLDING: { text: 'Đang giữ kho cho bạn', tone: 'blue' },
  CHECKED_IN: { text: 'Đã nhận kho', tone: 'green' },
  CANCELLED: { text: 'Đã hủy', tone: 'red' },
  NO_SHOW: { text: 'Khách không đến', tone: 'red' },
}

export const displayStatus = (a) => {
  const key = a.displayStatus || a.status
  return DISPLAY[key] || { text: String(key || '').replace(/_/g, ' '), tone: undefined }
}

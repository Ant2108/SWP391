// Trạng thái hiển thị của lịch nhận kho (BE tính sẵn ở displayStatus): chưa trả cọc đợt 1 -> đang giữ kho -> đã check-in.
const DISPLAY = {
  NOT_PAID: { text: 'Deposit not paid', tone: 'yellow' },
  HOLDING: { text: 'Holding your unit', tone: 'blue' },
  CHECKED_IN: { text: 'Checked in', tone: 'green' },
  CANCELLED: { text: 'Cancelled', tone: 'red' },
  NO_SHOW: { text: 'No-show', tone: 'red' },
}

export const displayStatus = (a) => {
  const key = a.displayStatus || a.status
  return DISPLAY[key] || { text: String(key || '').replace(/_/g, ' '), tone: undefined }
}

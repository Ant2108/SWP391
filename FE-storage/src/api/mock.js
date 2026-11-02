// Dữ liệu giả cho các chức năng customer mà BE chưa có (profile, reservation, payment, appointment, support).
// Lưu trong localStorage theo từng user. Khi BE có API thật, chỉ cần thay thân các hàm trong file này.

const delay = (v) => new Promise((r) => setTimeout(() => r(v), 150))
const uidOf = () => {
  try { return JSON.parse(localStorage.getItem('auth'))?.userId ?? 'anon' } catch { return 'anon' }
}
const key = (name) => `mock:${name}:${uidOf()}`

function read(name, fallback) {
  try { return JSON.parse(localStorage.getItem(key(name))) ?? fallback } catch { return fallback }
}
function write(name, value) {
  try { localStorage.setItem(key(name), JSON.stringify(value)) } catch { /* storage unavailable */ }
}

const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`
const today = () => new Date().toISOString().slice(0, 10)
const addMonths = (iso, n) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }

export const mock = {
  reservations: {
    list: () => delay([...read('reservations', [])].reverse()),
    get: (id) => {
      const r = read('reservations', []).find((x) => x.id === id)
      return r ? delay(r) : Promise.reject(new Error('Reservation not found'))
    },
    cancel: (id) => {
      const all = read('reservations', [])
      const r = all.find((x) => x.id === id)
      if (!r) return Promise.reject(new Error('Reservation not found'))
      r.status = 'CANCELLED'
      write('reservations', all)
      write('rentals', read('rentals', []).map((x) => (x.reservationId === id ? { ...x, status: 'ENDED' } : x)))
      return delay(r)
    },
  },

  rentals: { list: () => delay([...read('rentals', [])].reverse()) },
  payments: { list: () => delay([...read('payments', [])].reverse()) },

  /** Thanh toán giả: tạo reservation + payment + rental trong một lần. */
  checkout({ facility, unitType, unitCode, months, startDate, method, monthlyPrice, deposit }) {
    const total = monthlyPrice * months + deposit
    const reservation = {
      id: newId('RSV'), createdAt: new Date().toISOString(), status: 'CONFIRMED',
      facilityId: facility.id, facilityName: facility.name, facilityAddress: facility.address,
      unitTypeId: unitType.id, unitTypeName: unitType.typeName, unitCode,
      months, startDate, endDate: addMonths(startDate, months),
      monthlyPrice, deposit, total,
    }
    const payment = {
      id: newId('PAY'), reservationId: reservation.id, createdAt: reservation.createdAt,
      amount: total, method, status: 'PAID',
      description: `${unitType.typeName} · ${months} month(s) at ${facility.name}`,
    }
    const rental = {
      id: newId('RNT'), reservationId: reservation.id, unitCode, unitTypeName: unitType.typeName,
      facilityName: facility.name, startDate, endDate: reservation.endDate, monthlyPrice, status: 'ACTIVE',
    }
    write('reservations', [...read('reservations', []), reservation])
    write('payments', [...read('payments', []), payment])
    write('rentals', [...read('rentals', []), rental])
    return delay({ reservation, payment, rental })
  },

  appointments: {
    list: () => delay([...read('appointments', [])].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))),
    create: ({ facilityId, facilityName, date, time, purpose, note }) => {
      const a = { id: newId('APT'), facilityId, facilityName, date, time, purpose, note, status: 'SCHEDULED', createdAt: new Date().toISOString() }
      write('appointments', [...read('appointments', []), a])
      return delay(a)
    },
    cancel: (id) => {
      write('appointments', read('appointments', []).map((a) => (a.id === id ? { ...a, status: 'CANCELLED' } : a)))
      return delay(true)
    },
  },

  tickets: {
    list: () => delay([...read('tickets', [])].reverse()),
    create: ({ subject, category, facilityName, message }) => {
      const t = {
        id: newId('TKT'), subject, category, facilityName, status: 'OPEN', createdAt: new Date().toISOString(),
        messages: [{ from: 'you', text: message, at: new Date().toISOString() }],
      }
      write('tickets', [...read('tickets', []), t])
      return delay(t)
    },
    reply: (id, text) => {
      const all = read('tickets', [])
      const t = all.find((x) => x.id === id)
      if (!t) return Promise.reject(new Error('Ticket not found'))
      t.messages.push({ from: 'you', text, at: new Date().toISOString() })
      write('tickets', all)
      return delay(t)
    },
    close: (id) => {
      write('tickets', read('tickets', []).map((t) => (t.id === id ? { ...t, status: 'CLOSED' } : t)))
      return delay(true)
    },
  },
}

export { today }

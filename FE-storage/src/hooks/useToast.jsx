import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((message, type = 'success') => {
    const id = Math.random()
    setItems((l) => [...l, { id, message, type }])
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

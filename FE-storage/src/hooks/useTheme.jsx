import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const KEY = 'ss-theme'
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })

// index.html đã đặt data-theme trước khi vẽ trang; ở đây chỉ đọc lại giá trị đó.
function initialTheme() {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, next) } catch { /* bộ nhớ trình duyệt bị chặn: chỉ đổi trong phiên này */ }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

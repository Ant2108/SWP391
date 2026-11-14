import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import PageTransition from './components/landing/PageTransition.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import { ToastProvider } from './hooks/useToast.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import 'lenis/dist/lenis.css'
import './styles/index.css'
import './styles/units.css'
import './styles/home.css'
import './styles/warehouse-3d.css'
import './styles/landing.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
            {/* Hiệu ứng chuyển trang đặt ở gốc: chạy mỗi khi về trang chủ, từ bất kỳ trang nào (kể cả đăng nhập, quản lý, nút Back). */}
            <PageTransition />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

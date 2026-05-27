import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import Users from './pages/Users'
import EventLogs from './pages/EventLogs'
import Reports from './pages/Reports'
import Alerts from './pages/Alerts'
import Config from './pages/Config'

function Protected({ children }) {
  const auth = useStore(s => s.isAuthenticated)
  const checking = useStore(s => s.authChecking)
  if (checking) return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="text-slate-400 text-sm">Đang xác thực...</div>
    </div>
  )
  return auth ? children : <Navigate to="/login" replace />
}

export default function App() {
  const initApi    = useStore(s => s.initApi)
  const initSocket = useStore(s => s.initSocket)
  const initAuth   = useStore(s => s.initAuth)

  useEffect(() => {
    initAuth()
    initSocket()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="users" element={<Users />} />
          <Route path="events" element={<EventLogs />} />
          <Route path="reports" element={<Reports />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="config" element={<Config />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

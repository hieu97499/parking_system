import { useLocation } from 'react-router-dom'
import { Bell, Wifi, WifiOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useState, useEffect } from 'react'

const titles = {
  '/':         'Tổng quan',
  '/sessions': 'Phiên gửi xe',
  '/users':    'Người dùng',
  '/devices':  'Vận hành',
  '/events':   'Nhật ký sự kiện',
  '/reports':  'Báo cáo & Thống kê',
  '/alerts':   'Cảnh báo hệ thống',
  '/config':   'Cấu hình hệ thống',
}

export default function Header() {
  const { pathname } = useLocation()
  const { alerts } = useStore()
  const unresolvedCount = alerts.filter(a => !a.is_resolved).length
  const [now, setNow] = useState(new Date())
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { clearInterval(t); window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const fmtDate = (d) =>
    d.toLocaleDateString('vi-VN', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })
  const fmtTime = (d) =>
    d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 shrink-0">
      <h1 className="text-base font-semibold text-gray-800 flex-1">
        {titles[pathname] ?? 'Tổng quan'}
      </h1>

      {}
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
        <span className="live-dot w-2 h-2 rounded-full bg-emerald-500 inline-block" />
        LIVE
      </div>

      {}
      <div className={`flex items-center gap-1 text-xs font-medium ${online ? 'text-emerald-600' : 'text-rose-600'}`}>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {online ? 'Đã kết nối' : 'Offline'}
      </div>

      {}
      <div className="text-xs text-gray-500 hidden sm:block">
        <span className="font-medium text-gray-700">{fmtTime(now)}</span>
        <span className="ml-2">{fmtDate(now)}</span>
      </div>

      {}
      <div className="relative">
        <button className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
          <Bell size={18} className="text-gray-600" />
        </button>
        {unresolvedCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {unresolvedCount}
          </span>
        )}
      </div>
    </header>
  )
}

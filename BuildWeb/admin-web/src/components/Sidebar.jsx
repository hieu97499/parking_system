import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Car, Users, Cpu, FileText,
  BarChart2, AlertTriangle, Settings, LogOut, ParkingSquare, Link2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import clsx from 'clsx'

const mainNavItems = [
  { to: '/',        icon: LayoutDashboard, label: 'Tổng quan',        exact: true },
  { to: '/sessions',icon: Car,             label: 'Phiên gửi xe' },
  { to: '/users',   icon: Users,           label: 'Người dùng' },
  { to: '/events',  icon: FileText,        label: 'Nhật ký sự kiện' },
  { to: '/reports', icon: BarChart2,       label: 'Báo cáo' },
  { to: '/alerts',  icon: AlertTriangle,   label: 'Cảnh báo' },
  { to: '/config',  icon: Settings,        label: 'Cấu hình' },
]

const connectNavItems = [
  { to: '/devices', icon: Cpu, label: 'Vận hành' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { currentAdmin, logout, alerts } = useStore()
  const unresolvedCount = alerts.filter(a => !a.is_resolved).length

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col w-64 min-h-screen bg-slate-900 text-white shrink-0">
      {}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
          <ParkingSquare size={20} />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">Bãi Xe Thông Minh</div>
          <div className="text-xs text-slate-400">ĐH Hàng Hải Việt Nam</div>
        </div>
      </div>

      {}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {}
        <div className="space-y-0.5">
          {mainNavItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Cảnh báo' && unresolvedCount > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {unresolvedCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {}
        <div className="mt-5">
          <div className="flex items-center gap-2 px-3 mb-1.5">
          </div>
          <div className="space-y-0.5">
            {connectNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  )
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {}
      <div className="px-3 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
            {currentAdmin?.full_name?.[0] ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{currentAdmin?.full_name}</div>
            <div className="text-xs text-slate-400 capitalize">{currentAdmin?.role}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Đăng xuất
        </button>
      </div>
    </div>
  )
}

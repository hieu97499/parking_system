import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { dashboardApi, reportsApi } from '../api/services'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ParkingSquare, Car, CheckCircle, BanknoteIcon,
} from 'lucide-react'
import clsx from 'clsx'

const fmtVND = n => n?.toLocaleString('vi-VN') + 'đ'
const fmtDuration = (entry) => {
  const diff = Math.floor((Date.now() - new Date(entry).getTime()) / 60000)
  if (diff < 60) return `${diff} phút`
  const h = Math.floor(diff / 60), m = diff % 60
  return `${h}g ${m}p`
}

export default function Dashboard() {
  const {
    lot, activeSessions, alerts,
    dashboardStats,
    fetchDashboardStats, fetchActiveSessions, fetchAlerts,
  } = useStore()
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const [dailyReports, setDailyReports] = useState([])
  const [hourlyTraffic, setHourlyTraffic] = useState([])

  useEffect(() => {
    fetchDashboardStats()
    fetchActiveSessions()
    fetchAlerts()
    loadCharts()
    const t = setInterval(() => {
      setTick(v => v + 1)
      fetchDashboardStats()
      fetchActiveSessions()
    }, 30000)
    return () => clearInterval(t)
  }, [])

  async function loadCharts() {
    try {
      const today = new Date()
      const from = new Date(today - 6 * 86400000).toISOString().split('T')[0]
      const to   = today.toISOString().split('T')[0]
      const [daily, hourly] = await Promise.all([
        reportsApi.daily(from, to),
        dashboardApi.hourlyTraffic(),
      ])

      const sorted = [...daily].sort((a, b) => a.report_date > b.report_date ? 1 : -1)
      setDailyReports(sorted.map(r => ({
        ...r,
        date: new Date(r.report_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      })))
      setHourlyTraffic(hourly)
    } catch {}
  }

  const capacity  = dashboardStats?.capacity  ?? lot.total_capacity
  const occupied  = dashboardStats?.occupied  ?? lot.current_occupancy
  const todayRevenue  = dashboardStats?.todayRevenue  ?? 0
  const todaySessions = dashboardStats?.todaySessions ?? 0

  const unresolved   = alerts.filter(a => !a.is_resolved).length
  const occupancyPct = capacity > 0 ? Math.round(occupied * 100 / capacity) : 0

  return (
    <div className="space-y-6">
      {}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<ParkingSquare size={22} />}
          iconBg="bg-blue-100 text-blue-600"
          label="Tổng sức chứa"
          value={capacity}
          sub="chỗ đỗ"
        />
        <StatCard
          icon={<Car size={22} />}
          iconBg="bg-amber-100 text-amber-600"
          label="Đang đỗ"
          value={occupied}
          sub={`${occupancyPct}% lấp đầy`}
          valueClass="text-amber-600"
        />
        <StatCard
          icon={<CheckCircle size={22} />}
          iconBg="bg-emerald-100 text-emerald-600"
          label="Còn trống"
          value={capacity - occupied}
          sub="chỗ có sẵn"
          valueClass="text-emerald-600"
        />
        <StatCard
          icon={<BanknoteIcon size={22} />}
          iconBg="bg-purple-100 text-purple-600"
          label="Doanh thu hôm nay"
          value={fmtVND(todayRevenue)}
          sub={`${todaySessions} lần gửi`}
          valueClass="text-purple-700 text-xl"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800">{lot.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{lot.address}</p>
            </div>
            <span className={clsx(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              occupancyPct >= 90 ? 'bg-rose-100 text-rose-700'
              : occupancyPct >= 70 ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
            )}>
              {occupancyPct}% đầy
            </span>
          </div>
          <div className="flex items-center gap-4 mb-2">
            <span className="text-3xl font-bold text-gray-900">{occupied}</span>
            <span className="text-gray-400">/</span>
            <span className="text-2xl text-gray-500">{capacity}</span>
            <span className="text-sm text-gray-500">xe đang đỗ</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={clsx(
                'h-3 rounded-full transition-all duration-700',
                occupancyPct >= 90 ? 'bg-rose-500'
                : occupancyPct >= 70 ? 'bg-amber-500'
                : 'bg-emerald-500'
              )}
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0</span>
            <span>{capacity}</span>
          </div>
        </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-800">Xe đang trong bãi</h2>
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {activeSessions.length}
              </span>
            </div>
            <button onClick={() => navigate('/sessions')} className="text-xs text-blue-600 hover:underline">
              Xem tất cả →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
                <tr>
                  <th className="px-5 py-3 text-left">Biển số</th>
                  <th className="px-5 py-3 text-left">Chủ xe</th>
                  <th className="px-5 py-3 text-left">Thời gian vào</th>
                  <th className="px-5 py-3 text-left">Đã gửi</th>
                  <th className="px-5 py-3 text-left">Loại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeSessions.slice(0, 6).map(s => (
                  <tr key={s.session_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono font-semibold text-gray-800">{s.license_plate}</td>
                    <td className="px-5 py-3 text-gray-700">{s.user_name ?? <span className="text-gray-400 italic">Khách vãng lai</span>}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(s.entry_time).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{fmtDuration(s.entry_time)}</td>
                    <td className="px-5 py-3">
                      <SessionTypeBadge type={s.session_type} code={s.session_code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Doanh thu 7 ngày gần nhất</h2>
          {dailyReports.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu báo cáo</p>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyReports} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => (v/1000) + 'k'} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [fmtVND(v), 'Doanh thu']} />
              <Bar dataKey="total_revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Lưu lượng theo giờ – Hôm nay</h2>
          {hourlyTraffic.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu hôm nay</p>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hourlyTraffic} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v + ' xe', 'Lượt vào']} />
              <Line type="monotone" dataKey="entries" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      {}
      {unresolved > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <h2 className="font-semibold text-gray-800">Cảnh báo chưa xử lý</h2>
              <span className="bg-rose-100 text-rose-700 text-xs font-semibold px-2 py-0.5 rounded-full">{unresolved}</span>
            </div>
            <button onClick={() => navigate('/alerts')} className="text-xs text-blue-600 hover:underline">Xử lý ngay →</button>
          </div>
          <div className="divide-y divide-gray-100">
            {alerts.filter(a => !a.is_resolved).map(a => (
              <div key={a.alert_id} className="flex items-start gap-4 px-5 py-3 hover:bg-gray-50">
                <span className={clsx(
                  'mt-0.5 shrink-0 text-xs font-bold px-2 py-0.5 rounded',
                  a.severity === 'critical' ? 'bg-rose-100 text-rose-700'
                  : a.severity === 'warning' ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700'
                )}>
                  {a.severity === 'critical' ? 'NGHIÊM TRỌNG' : a.severity === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{a.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{a.description}</div>
                </div>
                <div className="text-xs text-gray-400 shrink-0">
                  {new Date(a.created_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


    </div>
  )
}

function StatCard({ icon, iconBg, label, value, sub, valueClass }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className={`text-2xl font-bold text-gray-900 mt-0.5 ${valueClass ?? ''}`}>{value}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
      </div>
    </div>
  )
}

function SessionTypeBadge({ type, code }) {
  if (type === 'guest') return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
      Vãng lai {code && <span className="font-mono">{code}</span>}
    </span>
  )
  if (type === 'authorized') return (
    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">Ủy quyền</span>
  )
  return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">Thành viên</span>
}

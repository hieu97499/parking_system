import { useState, useEffect } from 'react'
import { reportsApi, dashboardApi } from '../api/services'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Download, TrendingUp, Car, CheckCircle, Users, RefreshCw } from 'lucide-react'

const fmtVND = n => (n ?? 0).toLocaleString('vi-VN') + 'đ'
const fmtDate = d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

export default function Reports() {
  const [period, setPeriod]             = useState('week')
  const [dailyReports, setDailyReports] = useState([])
  const [hourlyTraffic, setHourlyTraffic] = useState([])
  const [loading, setLoading]           = useState(false)

  function getDateRange(p) {
    const today = new Date()
    const days  = p === 'month' ? 29 : 6
    const from  = new Date(today - days * 86400000).toISOString().split('T')[0]
    const to    = today.toISOString().split('T')[0]
    return { from, to }
  }

  async function loadData(p) {
    setLoading(true)
    try {
      const { from, to } = getDateRange(p)
      const [daily, hourly] = await Promise.all([
        reportsApi.daily(from, to),
        dashboardApi.hourlyTraffic(),
      ])
      setDailyReports(daily)
      setHourlyTraffic(hourly)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadData(period) }, [period])

  const totalRevenue  = dailyReports.reduce((s, r) => s + Number(r.total_revenue), 0)
  const totalSessions = dailyReports.reduce((s, r) => s + Number(r.total_sessions), 0)
  const totalSuccess  = dailyReports.reduce((s, r) => s + Number(r.auth_success_count), 0)
  const totalFailed   = dailyReports.reduce((s, r) => s + Number(r.auth_failed_count),  0)
  const authTotal     = totalSuccess + totalFailed
  const successRate   = authTotal > 0 ? Math.round(totalSuccess * 100 / authTotal) : 0
  const avgPerDay     = dailyReports.length > 0 ? Math.round(totalSessions / dailyReports.length) : 0

  const revenueData = dailyReports.map(r => ({
    date: fmtDate(r.report_date),
    'Thành viên': Number(r.member_revenue),
    'Vãng lai':   Number(r.guest_revenue),
  }))
  const sessionData = dailyReports.map(r => ({
    date: fmtDate(r.report_date),
    'Thành viên': Number(r.member_sessions),
    'Vãng lai':   Number(r.guest_sessions_count),
  }))
  const authPieData = [
    { name: 'Xác thực thành công', value: totalSuccess },
    { name: 'Xác thực thất bại',   value: totalFailed  },
  ]

  const handleExport = () => {
    const rows = [
      ['Ngày','Tổng phiên','Thành viên','Vãng lai','Tổng doanh thu','DT Thành viên','DT Vãng lai','XN thành công','XN thất bại'],
      ...dailyReports.map(r => [
        fmtDate(r.report_date),
        r.total_sessions, r.member_sessions, r.guest_sessions_count,
        r.total_revenue,  r.member_revenue,  r.guest_revenue,
        r.auth_success_count, r.auth_failed_count,
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'bao_cao_doanh_thu.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['week','7 ngày qua'],['month','30 ngày']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPeriod(v)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadData(period)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Tải lại
          </button>
          <button
            onClick={handleExport}
            disabled={dailyReports.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Download size={15} /> Xuất CSV
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-400 text-sm">Đang tải dữ liệu...</div>
      )}

      {!loading && dailyReports.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          Không có dữ liệu cho khoảng thời gian này
        </div>
      )}

      {dailyReports.length > 0 && (<>

      {}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20}/>} bg="bg-blue-100 text-blue-600"
          label="Tổng doanh thu" value={fmtVND(totalRevenue)} sub={`${dailyReports.length} ngày`} />
        <KpiCard icon={<Car size={20}/>} bg="bg-amber-100 text-amber-600"
          label="Tổng lượt gửi" value={totalSessions} sub={`${dailyReports.length} ngày`} />
        <KpiCard icon={<CheckCircle size={20}/>} bg="bg-emerald-100 text-emerald-600"
          label="Tỷ lệ xác thực OK"
          value={authTotal > 0 ? `${successRate}%` : '—'}
          sub={authTotal > 0 ? `${totalSuccess} / ${authTotal}` : 'Không có dữ liệu'} />
        <KpiCard icon={<Users size={20}/>} bg="bg-purple-100 text-purple-600"
          label="TB phiên / ngày" value={avgPerDay} sub="lượt / ngày" />
      </div>

      {}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-5">Doanh thu theo ngày (VND)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={revenueData} margin={{ top:0, right:10, left:20, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => (v/1000)+'k'} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => fmtVND(v)} />
            <Legend />
            <Bar dataKey="Thành viên" fill="#3b82f6" radius={[4,4,0,0]} stackId="a" />
            <Bar dataKey="Vãng lai"   fill="#10b981" radius={[4,4,0,0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-5">Lưu lượng xe theo ngày</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sessionData} margin={{ top:0, right:10, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Thành viên" fill="#6366f1" radius={[4,4,0,0]} stackId="b" />
              <Bar dataKey="Vãng lai"   fill="#f59e0b" radius={[4,4,0,0]} stackId="b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <h2 className="font-semibold text-gray-800 mb-4">Tỷ lệ xác thực</h2>
          {authTotal === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu</div>
          ) : (
            <>
              <div className="flex-1 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={authPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                      paddingAngle={3} dataKey="value">
                      {authPieData.map((_, i) => <Cell key={i} fill={[COLORS[0], COLORS[2]][i]} />)}
                    </Pie>
                    <Tooltip formatter={v => [`${v} lần`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {authPieData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: [COLORS[0], COLORS[2]][i] }} />
                    <span className="text-gray-600 flex-1">{item.name}</span>
                    <span className="font-semibold text-gray-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {}
      {hourlyTraffic.some(h => h.entries > 0) && (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-5">Lưu lượng theo khung giờ – Hôm nay</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={hourlyTraffic} margin={{ top:0, right:10, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => [`${v} xe`, 'Lượt']} />
            <Line type="monotone" dataKey="entries" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}

      {}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Bảng chi tiết theo ngày</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                {['Ngày','Tổng phiên','Thành viên','Vãng lai','Doanh thu','XN thành công','XN thất bại'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dailyReports.map(r => (
                <tr key={r.report_date} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-semibold text-gray-800">{fmtDate(r.report_date)}</td>
                  <td className="px-5 py-3 text-gray-700">{r.total_sessions}</td>
                  <td className="px-5 py-3 text-blue-700">{r.member_sessions}</td>
                  <td className="px-5 py-3 text-amber-700">{r.guest_sessions_count}</td>
                  <td className="px-5 py-3 font-semibold text-gray-800">{fmtVND(r.total_revenue)}</td>
                  <td className="px-5 py-3 text-emerald-700">{r.auth_success_count}</td>
                  <td className="px-5 py-3 text-rose-700">{r.auth_failed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      </>)}
    </div>
  )
}

function KpiCard({ icon, bg, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
      <div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
        <div className="text-xs text-gray-400">{sub}</div>
      </div>
    </div>
  )
}

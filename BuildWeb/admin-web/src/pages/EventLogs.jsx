import { useState, useEffect, useRef, useCallback } from 'react'
import { eventLogsApi } from '../api/services'
import { Search, X, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

const EventConfig = {
  vehicle_entry:         { label:'Xe vào',           color:'bg-emerald-100 text-emerald-700' },
  vehicle_exit:          { label:'Xe ra',            color:'bg-blue-100 text-blue-700'   },
  vehicle_entry_guest:   { label:'Vãng lai vào',     color:'bg-gray-100 text-gray-600'   },
  vehicle_exit_guest:    { label:'Vãng lai ra',      color:'bg-gray-100 text-gray-600'   },
  auth_success_owner:    { label:'XN chính chủ',     color:'bg-emerald-100 text-emerald-700' },
  auth_success_delegate: { label:'XN ủy quyền',      color:'bg-purple-100 text-purple-700' },
  auth_failed_face:      { label:'Lỗi nhận diện',    color:'bg-amber-100 text-amber-700' },
  auth_failed_plate:     { label:'Lỗi OCR biển số',  color:'bg-amber-100 text-amber-700' },
  auth_failed_mismatch:  { label:'Không khớp TK',    color:'bg-amber-100 text-amber-700' },
  auth_fallback_guest:   { label:'→ Vãng lai',       color:'bg-orange-100 text-orange-700' },
  barrier_opened:        { label:'Barrier mở',       color:'bg-sky-100 text-sky-700'     },
  barrier_closed:        { label:'Barrier đóng',     color:'bg-slate-100 text-slate-600' },
  barrier_manual_open:   { label:'Barrier thủ công', color:'bg-rose-100 text-rose-700'   },
  payment_deducted:      { label:'Trừ phí',          color:'bg-violet-100 text-violet-700' },
  payment_failed_balance:{ label:'Không đủ tiền',    color:'bg-rose-100 text-rose-700'   },
  low_balance_alert:     { label:'Số dư thấp',       color:'bg-amber-100 text-amber-700' },
  device_offline:        { label:'TB mất kết nối',   color:'bg-rose-100 text-rose-700'   },
  device_online:         { label:'TB trực tuyến',    color:'bg-emerald-100 text-emerald-700' },
  arduino_disconnected:  { label:'Arduino mất kết nối', color:'bg-rose-100 text-rose-700'},
  session_abnormal:      { label:'Phiên bất thường', color:'bg-rose-100 text-rose-700'   },
  session_force_ended:   { label:'Kết thúc thủ công', color:'bg-rose-100 text-rose-700'  },
  camera_error:          { label:'Lỗi camera',       color:'bg-rose-100 text-rose-700'   },
  system_offline_mode:   { label:'Chế độ offline',   color:'bg-gray-100 text-gray-700'   },
  sync_completed:        { label:'Đồng bộ xong',     color:'bg-green-100 text-green-700' },
  lot_full:              { label:'Bãi đầy',          color:'bg-rose-100 text-rose-700'   },
  payment_guest_paid:    { label:'KVL đã TT',        color:'bg-green-100 text-green-700' },
}

const fmtTime = d => new Date(d).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })

export default function EventLogs() {
  const [logs, setLogs]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [filterType, setFilterType] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const timerRef = useRef(null)
  const LIMIT = 50

  const typeOptions = [
    { value:'all',      label:'Tất cả' },
    { value:'vehicle',  label:'Xe ra/vào' },
    { value:'auth',     label:'Xác thực' },
    { value:'barrier',  label:'Barrier' },
    { value:'payment',  label:'Tài chính' },
    { value:'device',   label:'Thiết bị' },
    { value:'alert',    label:'Cảnh báo' },
  ]

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, limit: LIMIT }
      if (search)                      params.search    = search
      if (filterType !== 'all')        params.typeGroup = filterType
      const res = await eventLogsApi.list(params)
      setLogs(res.data || [])
      setTotal(res.total || 0)
      setPage(p)
    } catch {}
    finally { setLoading(false) }
  }, [search, filterType])

  useEffect(() => {
    fetchLogs(1)
  }, [search, filterType])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => fetchLogs(1), 10000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [autoRefresh, fetchLogs])

  const totalPages = Math.ceil(total / LIMIT)

  const handleExport = () => {
    const rows = [
      ['Thời gian','Loại sự kiện','Biển số','Mô tả'],
      ...logs.map(e => [fmtTime(e.created_at), e.event_type, e.license_plate ?? '', e.description ?? ''])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'event_logs.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm biển số, mô tả..."
            className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14}/></button>}
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button
          onClick={() => setAutoRefresh(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            autoRefresh
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          <RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''} />
          {autoRefresh ? 'Đang cập nhật...' : 'Tự động cập nhật'}
        </button>

        <button
          onClick={() => fetchLogs(page)}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
        >
          <RefreshCw size={14} /> Tải lại
        </button>

        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm text-gray-700 transition-colors"
        >
          <Download size={14} /> Xuất CSV
        </button>

        <span className="text-sm text-gray-500">{total} sự kiện</span>
      </div>

      {}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                {['Thời gian','Loại sự kiện','Biển số','Mô tả'].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">Đang tải...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">Không tìm thấy kết quả</td></tr>
              ) : logs.map(e => {
                const cfg = EventConfig[e.event_type]
                return (
                  <tr key={e.event_id || e.log_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {fmtTime(e.created_at)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {cfg
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        : <span className="text-xs text-gray-500 font-mono">{e.event_type}</span>
                      }
                    </td>
                    <td className="px-5 py-3 font-mono text-gray-700 whitespace-nowrap">
                      {e.license_plate ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{e.description}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => fetchLogs(page - 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">Trang {page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => fetchLogs(page + 1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

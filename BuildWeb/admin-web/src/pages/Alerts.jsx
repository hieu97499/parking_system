import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X, Filter } from 'lucide-react'
import clsx from 'clsx'

const SeverityCfg = {
  critical: { label:'Nghiêm trọng', Icon: AlertCircle,  bg:'bg-rose-50',  border:'border-rose-200',  badge:'bg-rose-100 text-rose-700',   dot:'bg-rose-500'   },
  warning:  { label:'Cảnh báo',     Icon: AlertTriangle, bg:'bg-amber-50', border:'border-amber-200', badge:'bg-amber-100 text-amber-700', dot:'bg-amber-500'  },
  info:     { label:'Thông tin',    Icon: Info,          bg:'bg-blue-50',  border:'border-blue-200',  badge:'bg-blue-100 text-blue-700',   dot:'bg-blue-500'   },
}

const TypeLabel = {
  device_offline:'Thiết bị mất kết nối', arduino_disconnected:'Arduino USB Serial',
  session_abnormal:'Phiên bất thường', lot_full:'Bãi đầy',
  low_balance_user:'Số dư thấp', sync_failed:'Đồng bộ thất bại',
  auth_anomaly:'Tỉ lệ XN bất thường', barrier_stuck:'Barrier không phản hồi',
  camera_error:'Lỗi camera',
}

const fmtTime = d => new Date(d).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })

export default function Alerts() {
  const { alerts, resolveAlert, fetchAlerts } = useStore()
  const [filter, setFilter] = useState('unresolved')
  const [resolveModal, setResolveModal] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAlerts().finally(() => setLoading(false))
    const t = setInterval(() => fetchAlerts(), 30000)
    return () => clearInterval(t)
  }, [])

  const shown = alerts.filter(a => {
    if (filter === 'unresolved') return !a.is_resolved
    if (filter === 'critical')   return !a.is_resolved && a.severity === 'critical'
    return true
  }).sort((a, b) => {
    if (a.is_resolved !== b.is_resolved) return a.is_resolved ? 1 : -1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const unresolved = alerts.filter(a => !a.is_resolved).length
  const critical   = alerts.filter(a => !a.is_resolved && a.severity === 'critical').length

  const handleResolve = () => {
    resolveAlert(resolveModal.alert_id, resolveNote)
    setResolveModal(null)
    setResolveNote('')
  }

  return (
    <div className="space-y-5">
      {}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-4">
          <AlertCircle size={24} className="text-rose-600 shrink-0" />
          <div>
            <div className="text-2xl font-bold text-rose-700">{critical}</div>
            <div className="text-xs text-rose-600 font-medium">Nghiêm trọng</div>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <AlertTriangle size={24} className="text-amber-600 shrink-0" />
          <div>
            <div className="text-2xl font-bold text-amber-700">{unresolved - critical}</div>
            <div className="text-xs text-amber-600 font-medium">Cảnh báo</div>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
          <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
          <div>
            <div className="text-2xl font-bold text-emerald-700">{alerts.length - unresolved}</div>
            <div className="text-xs text-emerald-600 font-medium">Đã xử lý</div>
          </div>
        </div>
      </div>

      {}
      <div className="flex items-center gap-2">
        <Filter size={15} className="text-gray-400" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['unresolved','Chưa xử lý'],['critical','Nghiêm trọng'],['all','Tất cả']].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={clsx(
                'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                filter === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              )}
            >
              {l}
              {v === 'unresolved' && unresolved > 0 && (
                <span className="ml-1.5 bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5">{unresolved}</span>
              )}
            </button>
          ))}
        </div>
        <span className="ml-2 text-sm text-gray-500">{shown.length} cảnh báo</span>
      </div>

      {}
      <div className="space-y-3">
        {loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Đang tải cảnh báo...</p>
          </div>
        )}
        {!loading && shown.map(a => {
          const cfg = SeverityCfg[a.severity] ?? SeverityCfg.info
          const { Icon } = cfg
          return (
            <div key={a.alert_id}
              className={clsx(
                'rounded-xl border p-5',
                a.is_resolved ? 'opacity-60 bg-gray-50 border-gray-200' : `${cfg.bg} ${cfg.border}`
              )}
            >
              <div className="flex items-start gap-4">
                <Icon size={20} className={a.severity === 'critical' ? 'text-rose-600' : a.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-500">{TypeLabel[a.alert_type] ?? a.alert_type}</span>
                    <span className="text-xs text-gray-400 ml-auto">{fmtTime(a.created_at)}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm">{a.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                  {a.is_resolved && a.resolution_note && (
                    <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                      ✓ Đã xử lý: {a.resolution_note}
                    </div>
                  )}
                </div>
                {!a.is_resolved && (
                  <button
                    onClick={() => { setResolveModal(a); setResolveNote('') }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-gray-700 rounded-lg transition-colors"
                  >
                    <CheckCircle2 size={13} /> Đánh dấu đã xử lý
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {!loading && shown.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-300" />
            <p className="font-medium">Không có cảnh báo nào trong mục này</p>
          </div>
        )}
      </div>

      {}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Xác nhận đã xử lý</h3>
              <button onClick={() => setResolveModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                <strong>{resolveModal.title}</strong>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Ghi chú xử lý <span className="text-gray-400">(tùy chọn)</span>
                </label>
                <textarea
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="VD: Đã kiểm tra lại kết nối USB, Arduino hoạt động bình thường..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setResolveModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button
                onClick={handleResolve}
                className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle2 size={15} /> Xác nhận đã xử lý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

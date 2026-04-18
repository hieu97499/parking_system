import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { sessionsApi } from '../api/services'
import { Search, X, Clock, DoorOpen, User } from 'lucide-react'
import clsx from 'clsx'

const fmtVND    = n => (n ?? 0).toLocaleString('vi-VN') + 'đ'
const fmtTime   = d => new Date(d).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
const fmtMins   = m => { if (!m) return '—'; const h = Math.floor(m/60), r = m%60; return h ? `${h}g ${r}p` : `${r}p` }
const fmtDur    = entry => {
  const diff = Math.floor((Date.now() - new Date(entry).getTime()) / 60000)
  const h = Math.floor(diff/60), m = diff%60
  return h ? `${h}g ${m}p` : `${m}p`
}

function Badge({ type, kind }) {
  if (kind === 'guest' || type === 'guest')
    return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">Vãng lai</span>
  if (type === 'authorized')
    return <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">Ủy quyền</span>
  return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">Thành viên</span>
}

export default function Sessions() {
  const { activeSessions, fetchActiveSessions } = useStore()
  const [tab, setTab]               = useState('active')
  const [search, setSearch]         = useState('')
  const [detail, setDetail]         = useState(null)
  const [forceEndModal, setForceEndModal] = useState(null)
  const [forceReason, setForceReason]    = useState('')
  const [forceEndLoading, setForceEndLoading] = useState(false)
  const [forceEndError, setForceEndError]     = useState('')
  const [history, setHistory]       = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeLoading, setActiveLoading]   = useState(false)

  const loadActive = useCallback(async () => {
    setActiveLoading(true)
    await fetchActiveSessions()
    setActiveLoading(false)
  }, [fetchActiveSessions])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const params = { limit: 100 }
      if (search) params.search = search
      const res = await sessionsApi.list(params)

      const done = (res.data || []).filter(s => s.status !== 'active')
      setHistory(done)
      setHistoryTotal(done.length)
    } catch {}
    setHistoryLoading(false)
  }, [search])

  useEffect(() => { loadActive() }, [loadActive])

  useEffect(() => {
    if (tab === 'history') {
      const t = setTimeout(loadHistory, 300)
      return () => clearTimeout(t)
    }
  }, [tab, loadHistory])

  const activeFiltered = activeSessions.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return (s.vehicle_plate ?? s.license_plate)?.toLowerCase().includes(q)
        || s.user_name?.toLowerCase().includes(q)
        || s.license_plate?.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5">
      {}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['active','Đang đỗ'], ['history','Lịch sử']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={clsx(
                'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                tab === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              )}
            >
              {l}
              {v === 'active' && (
                <span className="ml-1.5 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{activeSessions.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm biển số, tên khách..."
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {tab === 'active' && (
          <button
            onClick={loadActive}
            className="text-sm text-blue-600 hover:underline shrink-0"
          >
            Làm mới
          </button>
        )}
      </div>

      {}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {tab === 'active' ? (
          <>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <h2 className="font-semibold text-gray-800">Xe đang trong bãi ({activeFiltered.length})</h2>
              <span className="text-xs text-gray-400">
                ({activeFiltered.filter(s => s.session_kind === 'guest' || s.session_type === 'guest').length} vãng lai,&nbsp;
                {activeFiltered.filter(s => s.session_kind !== 'guest' && s.session_type !== 'guest').length} thành viên)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Biển số','Chủ xe / Loại','Vào lúc','Đã gửi','Thao tác'].map(h => (
                      <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeLoading && (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">Đang tải...</td></tr>
                  )}
                  {!activeLoading && activeFiltered.map(s => {
                    const plate = s.vehicle_plate || s.license_plate || '—'
                    const isGuest = s.session_kind === 'guest' || s.session_type === 'guest'
                    return (
                    <tr key={s.id || s.session_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail({ ...s, kind:'active' })}>
                      <td className="px-5 py-3 font-mono font-semibold text-gray-800">
                        {plate !== '—' ? plate : <span className="text-gray-400 italic">Chưa nhận dạng</span>}
                      </td>
                      <td className="px-5 py-3">
                        {isGuest ? (
                          <div className="flex items-center gap-1.5 text-gray-400 italic text-xs mb-0.5">
                            <User size={12} /> Khách vãng lai
                          </div>
                        ) : (
                          <div className="text-gray-800 text-sm mb-0.5">{s.user_name ?? <span className="text-gray-400 italic">—</span>}</div>
                        )}
                        <Badge type={s.session_type} kind={s.session_kind} />
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {new Date(s.entry_time).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
                      </td>
                      <td className="px-5 py-3 text-gray-600 font-medium">{fmtDur(s.entry_time)}</td>
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setForceEndModal(s); setForceReason('') }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-medium transition-colors"
                        >
                          <DoorOpen size={14} /> Mở barrier / Kết thúc
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                  {!activeLoading && activeFiltered.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">Không có xe nào đang trong bãi</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Lịch sử phiên gửi xe ({historyTotal})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Biển số','Chủ xe','Vào','Ra','Thời gian','Phí','Loại'].map(h => (
                      <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyLoading && (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">Đang tải...</td></tr>
                  )}
                  {!historyLoading && history.map(s => {
                    const plate = s.vehicle_plate || s.license_plate
                    return (
                    <tr key={s.id || s.session_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail({ ...s, kind:'history' })}>
                      <td className="px-5 py-3 font-mono font-semibold text-gray-800">
                        {plate ?? <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {s.user_name ?? <span className="text-gray-400 italic">Vãng lai</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{fmtTime(s.entry_time)}</td>
                      <td className="px-5 py-3 text-gray-600">{s.exit_time ? fmtTime(s.exit_time) : '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{fmtMins(s.duration_minutes)}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{fmtVND(s.fee_charged ?? s.fee)}</td>
                      <td className="px-5 py-3"><Badge type={s.session_type} kind={s.session_kind} /></td>
                    </tr>
                    )
                  })}
                  {!historyLoading && history.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">Không tìm thấy kết quả</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Chi tiết phiên – {detail.vehicle_plate || detail.license_plate || '—'}</h3>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Biển số" value={<span className="font-mono font-bold">{detail.vehicle_plate || detail.license_plate || '—'}</span>} />
                <InfoRow label="Loại phiên" value={<Badge type={detail.session_type} code={detail.session_code} />} />
                <InfoRow label="Chủ xe" value={detail.user_name ?? 'Khách vãng lai'} />
                <InfoRow label="Thời gian vào"
                  value={new Date(detail.entry_time).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} />
                {detail.exit_time && <>
                  <InfoRow label="Thời gian ra"
                    value={new Date(detail.exit_time).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} />
                  <InfoRow label="Thời gian gửi" value={fmtMins(detail.duration_minutes)} />
                </>}
                {detail.kind === 'active' && (
                  <InfoRow label="Đã gửi" value={<span className="font-medium text-amber-600">{fmtDur(detail.entry_time)}</span>} />
                )}
                {detail.fee != null && <InfoRow label="Phí" value={<span className="font-bold text-emerald-700">{fmtVND(detail.fee)}</span>} />}
              </div>
              {detail.kind === 'active' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm text-amber-700">
                  <Clock size={15} />
                  Xe đang trong bãi. Thời gian sẽ tiếp tục tính cho đến khi ra.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setDetail(null)}
                className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {forceEndModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Mở barrier & kết thúc phiên thủ công</h3>
              <button onClick={() => setForceEndModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <span className="font-mono font-bold">{forceEndModal.vehicle_plate || forceEndModal.license_plate || '—'}</span>
                <span className="text-gray-500 ml-2">– {forceEndModal.user_name ?? 'Khách vãng lai'}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Lý do <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={forceReason}
                  onChange={e => setForceReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="VD: Xe hỏng, khẩn cấp, kiểm tra kỹ thuật..."
                />
              </div>
            </div>
            {forceEndError && (
              <div className="px-6 pb-2 text-sm text-rose-600">{forceEndError}</div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => { setForceEndModal(null); setForceEndError('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button
                disabled={!forceReason.trim() || forceEndLoading}
                onClick={async () => {
                  if (!forceReason.trim()) return
                  setForceEndLoading(true)
                  setForceEndError('')
                  try {
                    const sessionId = forceEndModal.id || forceEndModal.session_id
                    await sessionsApi.forceEnd(sessionId, forceReason.trim())
                    setForceEndModal(null)
                    setForceReason('')
                    await loadActive()
                  } catch (err) {
                    setForceEndError(err.message || 'Có lỗi xảy ra, thử lại sau')
                  } finally {
                    setForceEndLoading(false)
                  }
                }}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {forceEndLoading ? 'Đang xử lý...' : 'Mở barrier & Kết thúc phiên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  )
}

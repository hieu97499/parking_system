
import { useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { ArrowDownToLine, ArrowUpFromLine, Wifi, WifiOff } from 'lucide-react'

const fmtTime = d => new Date(d).toLocaleTimeString('vi-VN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit'
})
const fmtVND = n => Number(n || 0).toLocaleString('vi-VN') + 'đ'

export default function HardwareMonitor() {
  const liveEvents      = useStore(s => s.liveEvents)
  const socketConnected = useStore(s => s.socketConnected)
  const listRef         = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [liveEvents])

  const lastEntry = liveEvents.find(e => e.type === 'vehicle:entry')
  const lastExit  = liveEvents.find(e => e.type === 'vehicle:exit')

  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-100">Xe ra / vào trực tiếp</h2>
        <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
          ${socketConnected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
          {socketConnected
            ? <><Wifi size={11} /><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</>
            : <><WifiOff size={11} />Mất kết nối</>}
        </span>
      </div>

      {}
      <div className="grid grid-cols-2 gap-3">
        {[
          { gate: 'entry', label: 'Cổng VÀO', last: lastEntry, icon: <ArrowDownToLine size={14} className="text-emerald-400" />, color: 'emerald' },
          { gate: 'exit',  label: 'Cổng RA',  last: lastExit,  icon: <ArrowUpFromLine size={14} className="text-blue-400" />,    color: 'blue' },
        ].map(({ gate, label, last, icon, color }) => (
          <div key={gate} className={`bg-gray-800 rounded-xl p-3.5 border border-gray-700`}>
            <div className="flex items-center gap-2 mb-2">
              {icon}
              <span className="font-medium text-sm text-gray-200">{label}</span>
            </div>
            {last ? (
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Biển số</span>
                  <span className="font-mono text-white font-bold">{last.data.plate || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Chủ xe</span>
                  <span className="text-white truncate ml-2 max-w-[120px]">
                    {last.data.user_info?.full_name || (last.data.session_kind === 'guest' ? 'Khách vãng lai' : '—')}
                  </span>
                </div>
                {last.data.fee != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phí</span>
                    <span className={`font-mono text-${color}-300`}>{fmtVND(last.data.fee)}</span>
                  </div>
                )}
                <div className="text-gray-600 text-[10px] mt-1">{fmtTime(last.ts)}</div>
              </div>
            ) : (
              <p className="text-xs text-gray-600">Chưa có xe trong phiên này</p>
            )}
          </div>
        ))}
      </div>

      {}
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Nhật ký sự kiện</span>
          <span className="text-xs text-gray-500">{liveEvents.length} sự kiện</span>
        </div>
        <div ref={listRef} className="h-60 overflow-y-auto divide-y divide-gray-800 text-xs font-mono">
          {liveEvents.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-600">
              Chờ sự kiện từ WebThietBi…
            </div>
          )}
          {liveEvents.map(ev => {
            const isEntry = ev.type === 'vehicle:entry'
            return (
              <div key={ev.id} className={`flex gap-3 px-4 py-2 ${isEntry ? 'bg-emerald-950/30' : 'bg-blue-950/20'}`}>
                <span className="text-gray-600 shrink-0">{fmtTime(ev.ts)}</span>
                <span className={`shrink-0 font-semibold ${isEntry ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {isEntry ? 'Xe vào' : 'Xe ra'}
                </span>
                <span className="text-gray-300 truncate">
                  {ev.data.plate
                    ? <>
                        <b className="text-white">{ev.data.plate}</b>
                        {ev.data.user_info?.full_name ? ` · ${ev.data.user_info.full_name}` : ev.data.session_kind === 'guest' ? ' · Khách vãng lai' : ''}
                        {ev.data.fee != null ? ` · ${fmtVND(ev.data.fee)}` : ''}
                      </>
                    : ev.data.message || (isEntry ? 'Xe vào bãi' : 'Xe rời bãi')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

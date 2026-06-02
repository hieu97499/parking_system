import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Wifi, WifiOff, Activity, Loader2, ShieldCheck, ShieldX,
  XCircle, Unlock, Lock, Maximize2, Minimize2, Camera, ParkingSquare, Settings,
  QrCode, Clock,
} from 'lucide-react'

const BRIDGE_WS  = import.meta.env.VITE_BRIDGE_WS  || 'ws://localhost:4002'
const STREAM_URL = import.meta.env.VITE_STREAM_URL || 'http://localhost:4002'
const AI_URL     = import.meta.env.VITE_AI_URL     || 'http://localhost:4002/ai'

// Camera mặc định: sau khi rút cắm lại USB -> index dịch sang 1
const DEFAULT_ASSIGNMENT = { entry_plate: 1, entry_face: 1, exit_plate: 1, exit_face: 1 }

const fmtTime = d => new Date(d).toLocaleTimeString('vi-VN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const fmtVND = n => Number(n || 0).toLocaleString('vi-VN') + 'đ'

// ---------- Màu accent cho từng cổng (Modern Minimal Light) ----------
const accentCfg = {
  blue:   { ring: 'ring-blue-200', bar: 'from-blue-500/90 to-blue-400/80', text: 'text-white' },
  violet: { ring: 'ring-blue-200', bar: 'from-blue-500/90 to-blue-400/80', text: 'text-white' },
  amber:  { ring: 'ring-blue-200', bar: 'from-blue-500/90 to-blue-400/80', text: 'text-white' },
  rose:   { ring: 'ring-blue-200', bar: 'from-blue-500/90 to-blue-400/80', text: 'text-white' },
}

const GATE_STATE = {
  idle:       { bg: 'bg-slate-100 border border-slate-200',          icon: null,                                                                  label: 'Đang chờ xe…',  cls: 'text-slate-500'  },
  detecting:  { bg: 'bg-amber-50 border border-amber-200',           icon: <Activity    size={14} className="text-amber-600 animate-pulse" />,    label: 'Phát hiện xe…', cls: 'text-amber-700 font-medium'  },
  processing: { bg: 'bg-cyan-50 border border-cyan-200',             icon: <Loader2     size={14} className="text-cyan-600 animate-spin"  />,    label: 'AI nhận diện…', cls: 'text-cyan-700 font-medium'   },
  allowed:    { bg: 'bg-emerald-500 border border-emerald-600 shadow-soft', icon: <ShieldCheck size={14} className="text-white"                 />,    label: 'MỞ CỔNG',       cls: 'text-white font-bold' },
  denied:     { bg: 'bg-rose-500 border border-rose-600 shadow-soft',       icon: <ShieldX     size={14} className="text-white"                 />,    label: 'TỪ CHỐI',       cls: 'text-white font-bold' },
  error:      { bg: 'bg-orange-50 border border-orange-200',         icon: <XCircle     size={14} className="text-orange-600"             />,    label: 'Lỗi xử lý',     cls: 'text-orange-700 font-medium' },
}

const EV_COLOR = {
  amber:   'border-l-amber-400   bg-amber-50/60   text-amber-800',
  cyan:    'border-l-cyan-400    bg-cyan-50/60    text-cyan-800',
  emerald: 'border-l-emerald-400 bg-emerald-50/60 text-emerald-800',
  rose:    'border-l-rose-400    bg-rose-50/60    text-rose-800',
  violet:  'border-l-violet-400  bg-violet-50/60  text-violet-800',
  orange:  'border-l-orange-400  bg-orange-50/60  text-orange-800',
  slate:   'border-l-slate-300   bg-slate-50      text-slate-600',
}

// ---------- CamAssignModal ----------
function CamAssignModal({ current, onClose, onSave }) {
  const [cameras,  setCameras]  = useState([])
  const [draft,    setDraft]    = useState(() => {
    // Đảm bảo giá trị int ở dạng number, không phải string
    const d = { ...current }
    for (const k of Object.keys(d)) {
      if (!isNaN(Number(d[k])) && !String(d[k]).startsWith('rtsp')) d[k] = Number(d[k])
    }
    return d
  })
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  useEffect(() => {
    fetch(`${AI_URL}/cameras`, { signal: AbortSignal.timeout(45000) })
      .then(r => r.json())
      .then(d => setCameras(d.cameras || []))
      .catch(() => setCameras([]))
  }, [])

  const SLOTS = [
    { key: 'entry_plate', label: '🔵 Cổng vào · Biển số' },
    { key: 'entry_face',  label: '🔵 Cổng vào · Khuôn mặt' },
    { key: 'exit_plate',  label: '🟠 Cổng ra · Biển số' },
    { key: 'exit_face',   label: '🟠 Cổng ra · Khuôn mặt' },
  ]

  // Chỉ liệt kê camera IP (RTSP)
  const allOptions = cameras
    .filter(c => c.source_type === 'rtsp')
    .map(c => ({ value: c.source, label: `📡 ${c.name}${c.width ? ` · ${c.width}×${c.height}` : ''}` }))

  const previewSrc = (src) =>
    `${STREAM_URL}/stream/preview?src=${encodeURIComponent(src)}`

  const handleChange = (key, rawVal) => {
    // Số nguyên → int, RTSP URL → string
    const parsed = (!isNaN(Number(rawVal)) && !String(rawVal).startsWith('rtsp'))
      ? Number(rawVal) : rawVal
    setDraft(p => ({ ...p, [key]: parsed }))
  }

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      const r = await fetch(`${AI_URL}/cameras/assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onSave(draft)
      onClose()
    } catch (e) {
      setErr(`Lưu thất bại: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Camera size={16} className="text-blue-600" />
            </div>
            Phân công Camera
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">✕</button>
        </div>

        {/* Slots grid */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {SLOTS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-700">{label}</span>

              {/* Stream preview */}
              <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video ring-1 ring-slate-200">
                <img
                  key={String(draft[key])}
                  src={previewSrc(draft[key])}
                  alt={label}
                  className="w-full h-full object-cover"
                  onError={e => { e.target.style.display='none' }}
                  onLoad={e  => { e.target.style.display='block' }}
                />
                <span className="absolute top-1.5 left-1.5 text-[10px] bg-white/90 backdrop-blur text-slate-700 px-1.5 py-0.5 rounded font-medium">
                  {typeof draft[key] === 'number' ? `USB ${draft[key]}` : `IP Cam`}
                </span>
              </div>

              {/* Select */}
              <select
                value={String(draft[key])}
                onChange={e => handleChange(key, e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition">
                {allOptions.map(opt => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {err && <p className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs mb-3">{err}</p>}
        {cameras.length === 0 && (
          <p className="text-xs text-slate-500 mb-3">Đang tải danh sách camera…</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600
              hover:bg-slate-50 text-sm font-medium transition-colors">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-soft
              text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Đang lưu…' : 'Lưu & Áp dụng'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- CameraBox ----------
function CameraBox({ streamSrc, camIndex, label, accent, result, resultType, fullscreen, onToggleFullscreen, onOnline }) {
  const [online,    setOnline]    = useState(false)
  const [retryKey,  setRetryKey]  = useState(0)
  const imgRef = useRef(null)
  const notifiedRef = useRef(false)
  const ac = accentCfg[accent]

  useEffect(() => {
    if (online) return
    const t = setTimeout(() => setRetryKey(k => k + 1), 4000)
    return () => clearTimeout(t)
  }, [online, retryKey])

  useEffect(() => {
    setOnline(false)
    const t = setInterval(() => {
      if (imgRef.current?.naturalWidth > 0) {
        setOnline(true)
        clearInterval(t)
        if (!notifiedRef.current) { notifiedRef.current = true; onOnline?.() }
      }
    }, 300)
    return () => clearInterval(t)
  }, [retryKey])

  const src = streamSrc
    ? `${streamSrc}?t=${retryKey}`
    : `${STREAM_URL}/stream/${camIndex}?t=${retryKey}`

  const overlay = () => {
    if (!result) return null
    if (resultType === 'plate') return (
      <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-sm p-2">
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-white text-sm tracking-widest">{result.plate || '—'}</span>
          <span className="text-[11px] text-slate-300">{((result.confidence || 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
    )
    if (resultType === 'face') return (
      <div className={`absolute bottom-0 left-0 right-0 p-2 backdrop-blur-sm
        ${result.matched ? 'bg-emerald-600/85' : 'bg-rose-600/85'}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">
            {result.matched ? '✅ Khớp khuôn mặt' : '❌ Không khớp'}
          </span>
          <span className="text-[11px] text-white/80">{((result.confidence || 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
    )
    return null
  }

  const boxClass = fullscreen
    ? 'fixed inset-4 z-50 rounded-2xl overflow-hidden shadow-2xl flex flex-col'
    : 'rounded-xl overflow-hidden flex flex-col shadow-card'

  return (
    <div className={`${boxClass} bg-slate-900 ring-1 ${ac.ring} border border-slate-200`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-r ${ac.bar} shrink-0`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300'}`} />
          <span className="text-[11px] font-semibold text-white">CAM {streamSrc ? label.toUpperCase().split(' ')[0] : camIndex}</span>
          <span className="text-[11px] text-white/80">{label}</span>
        </div>
        <button onClick={onToggleFullscreen} className="text-white/70 hover:text-white transition-colors p-0.5">
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Stream */}
      <div className="relative flex-1 flex items-center justify-center bg-slate-900" style={fullscreen ? {} : { aspectRatio: '4/3' }}>
        <img
          ref={imgRef}
          src={src}
          alt={label}
          className="w-full h-full object-contain"
          style={{ display: online ? 'block' : 'none' }}
        />
        {!online && (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Camera size={26} />
            <span className="text-xs">Đang kết nối cam {camIndex}…</span>
          </div>
        )}
        {overlay()}
      </div>
    </div>
  )
}

// ---------- GateColumn ----------
function GateColumn({ gate, assignment, dispatchRef, onSend, onCamOnline }) {
  const isEntry   = gate === 'entry'
  const camP = assignment[isEntry ? 'entry_plate' : 'exit_plate'] ?? DEFAULT_ASSIGNMENT[isEntry ? 'entry_plate' : 'exit_plate']
  const camF = assignment[isEntry ? 'entry_face'  : 'exit_face' ] ?? DEFAULT_ASSIGNMENT[isEntry ? 'entry_face'  : 'exit_face' ]
  const accent1 = isEntry ? 'blue'   : 'amber'
  const accent2 = isEntry ? 'violet' : 'rose'

  const [gateState,   setGateState]   = useState('idle')
  const [stateMsg,    setStateMsg]    = useState('')
  const [plateResult, setPlateResult] = useState(null)
  const [faceResult,  setFaceResult]  = useState(null)
  const [lastInfo,    setLastInfo]    = useState(null) // {plate, name, fee, kind}
  const [events,      setEvents]      = useState([])
  const [fullP,       setFullP]       = useState(false)
  const [fullF,       setFullF]       = useState(false)
  const resetRef = useRef(null)

  const pushEvent = useCallback(ev => setEvents(p => [ev, ...p].slice(0, 50)), [])

  const reset = useCallback(() => {
    setGateState('idle'); setStateMsg('')
    setPlateResult(null); setFaceResult(null)
  }, [])

  useEffect(() => {
    dispatchRef.current[gate] = ({ type, data = {} }) => {
      const ts = Date.now()
      clearTimeout(resetRef.current)
      switch (type) {
        case 'ENTRY_DETECTED':
        case 'EXIT_DETECTED':
          setGateState('detecting'); setStateMsg('')
          pushEvent({ label: isEntry ? '🚗 Xe vào phát hiện' : '🚙 Xe ra phát hiện', color: 'amber', ts })
          break
        case 'AI_RESULT':
          setGateState('processing')
          setPlateResult({ plate: data.plate || '', confidence: data.plate_confidence || 0 })
          setFaceResult({ matched: !!data.face_user_id, user_id: data.face_user_id, confidence: data.face_confidence || 0 })
          setStateMsg(`${data.plate || '—'} · mặt ${((data.face_confidence || 0) * 100).toFixed(0)}%`)
          pushEvent({ label: `🤖 ${data.plate || '—'} · mặt ${((data.face_confidence || 0) * 100).toFixed(0)}%`, color: 'cyan', ts })
          break
        case 'SESSION_CREATED':
          setGateState(data.allowed ? 'allowed' : 'denied')
          setStateMsg(data.allowed
            ? `${data.user_info?.full_name || 'Thành viên'}${data.monthly_pass ? ' · Vé tháng' : ''}`
            : data.message || '')
          if (data.allowed) {
            setLastInfo({ plate: data.plate, name: data.user_info?.full_name, kind: data.session_kind, fee: null })
          }
          pushEvent({
            label: data.allowed
              ? `✅ Vào: ${data.user_info?.full_name || 'Khách'} – ${data.plate || '—'}`
              : `❌ Từ chối: ${data.message || ''}`,
            color: data.allowed ? 'emerald' : 'rose', ts,
          })
          resetRef.current = setTimeout(reset, 8000)
          break
        case 'SESSION_CLOSED':
          setGateState('allowed')
          setStateMsg(`Phí: ${fmtVND(data.fee)}`)
          setLastInfo({ plate: data.plate, name: data.user_info?.full_name, fee: data.fee, kind: data.session_kind })
          pushEvent({ label: `✅ Ra cổng · ${data.plate || '—'} · ${fmtVND(data.fee)}`, color: 'emerald', ts })
          resetRef.current = setTimeout(reset, 8000)
          break
        case 'BARRIER_OPENED':
          pushEvent({ label: '🔓 Barrier mở', color: 'violet', ts })
          break
        case 'BARRIER_CLOSED':
          pushEvent({ label: '🔒 Barrier đóng', color: 'slate', ts })
          break
        case 'ERROR':
          setGateState('error'); setStateMsg(data.message || 'Lỗi')
          pushEvent({ label: `⚠️ ${data.message || 'Lỗi'}`, color: 'orange', ts })
          resetRef.current = setTimeout(reset, 6000)
          break
        case 'NO_OBJECT':
          setGateState('error'); setStateMsg('Không có đối tượng nhận diện')
          pushEvent({ label: '🚫 Không có đối tượng nhận diện', color: 'orange', ts })
          resetRef.current = setTimeout(reset, 5000)
          break
        case 'PAYMENT_REQUIRED':
          setGateState('processing'); setStateMsg(`Chờ TT ${fmtVND(data.fee)}`)
          pushEvent({ label: `💳 Khách VL · ${data.plate || '—'} · QR ${fmtVND(data.fee)}`, color: 'violet', ts })
          break
        case 'PAYMENT_SUCCESS':
          setGateState('allowed'); setStateMsg(`Đã TT ${fmtVND(data.fee)}`)
          setLastInfo({ plate: data.plate, name: 'Khách vãng lai', fee: data.fee, kind: 'guest' })
          pushEvent({ label: `✅ TT thành công · ${data.plate || '—'} · ${fmtVND(data.fee)}`, color: 'emerald', ts })
          resetRef.current = setTimeout(reset, 8000)
          break
        case 'PAYMENT_TIMEOUT':
          setGateState('error'); setStateMsg('Hết hạn thanh toán')
          pushEvent({ label: `⏱️ Hết hạn TT · ${data.session_code || ''}`, color: 'rose', ts })
          resetRef.current = setTimeout(reset, 6000)
          break
        default: break
      }
    }
    return () => { delete dispatchRef.current[gate] }
  }, [gate, isEntry, pushEvent, reset, dispatchRef])

  const stateCfg = GATE_STATE[gateState] || GATE_STATE.idle
  const headerBg = isEntry
    ? 'bg-gradient-to-r from-blue-50 to-white border-blue-200 text-blue-800'
    : 'bg-gradient-to-r from-amber-50 to-white border-amber-200 text-amber-800'
  const headerDot = isEntry ? 'bg-blue-500' : 'bg-amber-500'

  return (
    <div className="flex flex-col gap-3 h-full bg-white rounded-2xl border border-slate-200 shadow-card p-3">
      {/* Gate label */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border font-bold text-sm ${headerBg}`}>
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${headerDot} ring-4 ring-offset-0 ${isEntry ? 'ring-blue-100' : 'ring-amber-100'}`} />
          {isEntry ? 'CỔNG VÀO · ENTRY' : 'CỔNG RA · EXIT'}
        </span>
        {lastInfo && (
          <span className="text-xs font-normal opacity-80 truncate ml-2">
            {lastInfo.plate && <span className="font-mono mr-1 text-slate-800">{lastInfo.plate}</span>}
            {lastInfo.name && <span className="text-slate-700">{lastInfo.name}</span>}
            {lastInfo.fee != null && <span className="ml-1 text-emerald-700 font-semibold">· {fmtVND(lastInfo.fee)}</span>}
          </span>
        )}
      </div>

      {/* Cameras */}
      <div className="grid grid-cols-2 gap-2">
        <CameraBox
          streamSrc={`${STREAM_URL}/stream/role/${isEntry ? 'entry_plate' : 'exit_plate'}`}
          camIndex={camP} label={isEntry ? 'Biển số vào' : 'Biển số ra'}
          accent={accent1} resultType="plate" result={plateResult}
          fullscreen={fullP} onToggleFullscreen={() => setFullP(p => !p)}
          onOnline={onCamOnline} />
        <CameraBox
          streamSrc={`${STREAM_URL}/stream/role/${isEntry ? 'entry_face' : 'exit_face'}`}
          camIndex={camF} label={isEntry ? 'Khuôn mặt vào' : 'Khuôn mặt ra'}
          accent={accent2} resultType="face" result={faceResult}
          fullscreen={fullF} onToggleFullscreen={() => setFullF(p => !p)}
          onOnline={onCamOnline} />
      </div>

      {/* Gate state */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors duration-300 ${stateCfg.bg}`}>
        {stateCfg.icon}
        <span className={`text-sm ${stateCfg.cls}`}>{stateCfg.label}</span>
        {stateMsg && <span className="text-xs font-mono truncate ml-1 opacity-80">{stateMsg}</span>}
      </div>

      {/* Barrier buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSend(JSON.stringify({ type: 'OPEN_BARRIER', gate }))}
          className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold
            bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white transition-all shadow-soft">
          <Unlock size={16} /> Mở barrier
        </button>
        <button
          onClick={() => onSend(JSON.stringify({ type: 'CLOSE_BARRIER', gate }))}
          className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold
            bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all">
          <Lock size={16} /> Đóng barrier
        </button>
      </div>

      {/* Event log */}
      <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden flex flex-col min-h-0 max-h-72">
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white/60">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nhật ký sự kiện</span>
          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full font-medium">{events.length}</span>
        </div>
        <div className="overflow-y-auto flex-1 text-[11px] font-mono">
          {events.length === 0
            ? <p className="text-slate-400 text-center py-6 text-xs">Chờ sự kiện…</p>
            : events.map((ev, i) => (
              <div key={i} className={`flex gap-2 px-3 py-1.5 border-l-2 ${EV_COLOR[ev.color] || EV_COLOR.slate} border-b border-b-slate-100`}>
                <span className="text-slate-400 shrink-0 text-[10px]">{fmtTime(ev.ts)}</span>
                <span className="break-words">{ev.label}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Fullscreen backdrop */}
      {(fullP || fullF) && (
        <div className="fixed inset-0 z-40 bg-slate-900/70 backdrop-blur-sm"
          onClick={() => { setFullP(false); setFullF(false) }} />
      )}
    </div>
  )
}

// ---------- App ----------
export default function App() {
  const [bridgeConn,   setBridgeConn]   = useState(false)
  const [aiOnline,     setAiOnline]     = useState(false)
  const [assignment,   setAssignment]   = useState(DEFAULT_ASSIGNMENT)
  const [showCamModal, setShowCamModal] = useState(false)
  const [payment,      setPayment]      = useState(null) // {qr_url, fee, plate, session_code, bank_account, bank_code, account_name, started_ts}
  const wsRef       = useRef(null)
  const dispatchRef = useRef({})

  // Kết nối Bridge WebSocket
  useEffect(() => {
    let ws = null; let retry = null; let destroyed = false

    function connect() {
      if (destroyed) return
      try { ws = new WebSocket(BRIDGE_WS) } catch { retry = setTimeout(connect, 5000); return }
      wsRef.current = ws
      ws.onopen  = () => { if (!destroyed) setBridgeConn(true) }
      ws.onclose = () => {
        if (destroyed) return
        setBridgeConn(false); wsRef.current = null
        retry = setTimeout(connect, 5000)
      }
      ws.onerror = () => {}
      ws.onmessage = e => {
        if (destroyed) return
        try {
          const msg = JSON.parse(e.data)

          // ─── Sự kiện thanh toán khách vãng lai → modal cấp App ───
          if (msg.type === 'PAYMENT_REQUIRED') {
            setPayment({ ...msg.data, started_ts: Date.now() })
          } else if (msg.type === 'PAYMENT_SUCCESS' || msg.type === 'PAYMENT_TIMEOUT') {
            setPayment(null)
          }

          const gate = msg?.data?.gate
          if (gate && dispatchRef.current[gate]) {
            dispatchRef.current[gate](msg)
          } else {
            dispatchRef.current.entry?.(msg)
            dispatchRef.current.exit?.(msg)
          }
        } catch {}
      }
    }

    retry = setTimeout(connect, 200)
    return () => { destroyed = true; clearTimeout(retry); ws?.close() }
  }, [])

  // Poll AI service health
  useEffect(() => {
    let alive = true
    const ping = async () => {
      try {
        const r = await fetch(`${AI_URL}/health`, { signal: AbortSignal.timeout(2500) })
        if (alive) setAiOnline(r.ok)
      } catch { if (alive) setAiOnline(false) }
    }
    ping()
    const t = setInterval(ping, 6000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Lấy camera assignment từ AI service
  useEffect(() => {
    fetch(`${AI_URL}/cameras/assignment`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAssignment(d) })
      .catch(() => {})
  }, [])

  const sendWs = useCallback(msg => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3
        bg-white border-b border-slate-200 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-soft">
            <ParkingSquare size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">Web Vận Hành Bãi Xe</div>
            <div className="text-[11px] text-slate-500">Điều khiển & giám sát trực tiếp tại bãi</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border
            ${aiOnline
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            <Activity size={13} />
            <span className="font-medium">AI {aiOnline ? 'online' : 'offline'}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border
            ${bridgeConn
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            {bridgeConn ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span className="font-medium">Bridge {bridgeConn ? 'kết nối' : 'mất kết nối'}</span>
            {bridgeConn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </div>
          <button
            onClick={() => setShowCamModal(true)}
            title="Phân công camera cho từng vị trí"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-blue-600 text-white hover:bg-blue-700 shadow-soft
              transition-colors text-xs font-semibold">
            <Settings size={13} />
            Phân công Camera
          </button>
          <div className="text-slate-500 pl-2 border-l border-slate-200 font-medium">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
      </header>

      {/* Main: 2 cột cổng */}
      <main className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        <GateColumn gate="entry" assignment={assignment} dispatchRef={dispatchRef} onSend={sendWs} onCamOnline={null} />
        <GateColumn gate="exit"  assignment={assignment} dispatchRef={dispatchRef} onSend={sendWs} onCamOnline={null} />
      </main>

      {/* Modal phân công camera */}
      {showCamModal && (
        <CamAssignModal
          current={assignment}
          onClose={() => setShowCamModal(false)}
          onSave={newAssign => setAssignment(newAssign)}
        />
      )}

      {/* Modal QR thanh toán khách vãng lai */}
      {payment && (
        <PaymentModal payment={payment} onCancel={() => setPayment(null)} />
      )}
    </div>
  )
}

// ---------- PaymentModal ----------
function PaymentModal({ payment, onCancel }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - payment.started_ts) / 1000)), 1000)
    return () => clearInterval(t)
  }, [payment.started_ts])
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center gap-3">
          <QrCode className="text-white" size={28} />
          <div className="flex-1">
            <div className="text-white text-lg font-bold leading-tight">Khách Vãng Lai · Thanh Toán</div>
            <div className="text-white/80 text-xs">Quét QR bằng app ngân hàng bất kỳ</div>
          </div>
          <div className="flex items-center gap-1.5 text-white bg-white/15 px-2.5 py-1 rounded-full text-xs font-mono">
            <Clock size={13} /> {mm}:{ss}
          </div>
        </div>

        <div className="p-6 flex flex-col items-center gap-3">
          <div className="bg-white p-2 rounded-xl ring-4 ring-violet-100 shadow-soft">
            <img
              src={payment.qr_url}
              alt="QR thanh toán"
              className="w-64 h-64 object-contain"
            />
          </div>

          <div className="text-center mt-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Biển số</div>
            <div className="text-xl font-mono font-bold text-slate-900 tracking-widest">{payment.plate || '—'}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Số tiền</div>
              <div className="text-emerald-600 font-bold text-lg">{fmtVND(payment.fee)}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Ngân hàng</div>
              <div className="text-slate-800 font-bold text-lg">{payment.bank_code || '—'}</div>
            </div>
          </div>

          <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">STK:</span>
              <span className="font-mono font-bold text-slate-900">{payment.bank_account}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Chủ TK:</span>
              <span className="font-semibold text-slate-900">{payment.account_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Nội dung CK:</span>
              <span className="font-mono font-bold text-violet-700">{payment.session_code}</span>
            </div>
          </div>

          <div className="text-center text-[11px] text-slate-500 mt-1">
            Hệ thống tự động phát hiện thanh toán qua SePay và mở barrier
          </div>

          <button
            onClick={onCancel}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold
              bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
            Ẩn cửa sổ (vẫn chờ thanh toán nền)
          </button>
        </div>
      </div>
    </div>
  )
}

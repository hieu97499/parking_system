import { useState, useEffect, useRef, useCallback } from "react"
import {
  Camera, WifiOff, Maximize2, Minimize2,
  CheckCircle2, XCircle, ShieldCheck, ShieldX, Loader2, Wifi, Activity,
  Cpu, Server, Radio, HardDrive, Clock, Lock, Unlock, Settings, Save,
} from "lucide-react"
import { devicesApi } from "../api/services"

const AI_URL    = import.meta.env.VITE_AI_URL    || "http://localhost:5001"
const BRIDGE_WS = import.meta.env.VITE_BRIDGE_WS || "ws://localhost:4002"

const DEFAULT_ASSIGNMENT = { entry_plate: 0, entry_face: 1, exit_plate: 2, exit_face: 3 }

const accentCfg = {
  blue:   { ring: "ring-blue-500",   badge: "bg-blue-600",   dot: "bg-blue-400",   grad: "from-blue-900/80"   },
  violet: { ring: "ring-violet-500", badge: "bg-violet-600", dot: "bg-violet-400", grad: "from-violet-900/80" },
  amber:  { ring: "ring-amber-500",  badge: "bg-amber-600",  dot: "bg-amber-400",  grad: "from-amber-900/80"  },
  rose:   { ring: "ring-rose-500",   badge: "bg-rose-700",   dot: "bg-rose-400",   grad: "from-rose-900/80"   },
}

function DeviceTypeIcon({ type }) {
  const p = { size: 13, className: "shrink-0 text-gray-400" }
  switch (type) {
    case "arduino":                return <Cpu {...p} />
    case "camera_face":
    case "camera_plate":           return <Camera {...p} />
    case "barrier": case "sensor": return <Radio {...p} />
    case "computer":               return <Server {...p} />
    default:                       return <HardDrive {...p} />
  }
}

const STATUS_CFG = {
  online:      { cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500 animate-pulse" },
  offline:     { cls: "bg-slate-200/80   text-slate-500   border-slate-300/50",   dot: "bg-slate-400"                },
  error:       { cls: "bg-rose-500/15    text-rose-600    border-rose-500/30",    dot: "bg-rose-500"                 },
  maintenance: { cls: "bg-amber-500/15   text-amber-600   border-amber-500/30",   dot: "bg-amber-500"               },
}
function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.offline
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function DeviceListPanel({ lane, devices, loading }) {
  const title = lane === "entry" ? "🔵 Thiết bị – Lối vào" : "🟠 Thiết bị – Lối ra"
  const rows = devices.filter(d => d.lane === lane || d.lane === "both")
  if (loading) return <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 animate-pulse h-20" />
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
      <div className="text-xs font-semibold text-gray-600">{title}</div>
      {rows.length === 0
        ? <p className="text-xs text-gray-400 italic">Không có thiết bị</p>
        : rows.map(d => (
          <div key={d.device_id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <DeviceTypeIcon type={d.device_type} />
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-gray-700 truncate">{d.device_name}</div>
                <div className="text-[10px] text-gray-400">
                  {d.device_type}{d.serial_port ? ` · ${d.serial_port}` : ""}
                  {d.last_heartbeat && (
                    <span className="ml-1">· <Clock size={8} className="inline mb-0.5" /> {new Date(d.last_heartbeat).toLocaleTimeString("vi-VN")}</span>
                  )}
                </div>
              </div>
            </div>
            <StatusBadge status={d.status} />
          </div>
        ))
      }
    </div>
  )
}

function CamAssignPanel({ assignment, onSaved }) {
  const [open,    setOpen]    = useState(false)
  const [draft,   setDraft]   = useState(assignment)
  const [cameras, setCameras] = useState([])
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState(null)

  useEffect(() => { setDraft(assignment) }, [assignment])

  useEffect(() => {
    if (!open) return
    fetch(`${AI_URL}/cameras`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.cameras) setCameras(d.cameras) })
      .catch(() => {})
  }, [open])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch(`${AI_URL}/cameras/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
        signal: AbortSignal.timeout(4000),
      })
      const d = await r.json()
      if (r.ok && d.ok) {
        setMsg({ ok: true, text: "Đã lưu – stream sẽ cập nhật ngay" })
        onSaved(draft)
        setTimeout(() => setOpen(false), 1200)
      } else {
        setMsg({ ok: false, text: d.detail || "Lưu thất bại" })
      }
    } catch (e) {
      setMsg({ ok: false, text: "Không kết nối được AI service" })
    } finally {
      setSaving(false)
    }
  }

  const ROLES = [
    { key: "entry_plate", label: "Vào – Biển số",   accent: "blue"   },
    { key: "entry_face",  label: "Vào – Khuôn mặt", accent: "violet" },
    { key: "exit_plate",  label: "Ra  – Biển số",   accent: "amber"  },
    { key: "exit_face",   label: "Ra  – Khuôn mặt", accent: "rose"   },
  ]
  const accentText = { blue: "text-blue-600", violet: "text-violet-600", amber: "text-amber-600", rose: "text-rose-600" }
  const camLabel = idx => {
    const c = cameras.find(x => x.index === idx)
    return c ? `cam ${idx}  (${c.width}×${c.height})` : `cam ${idx}`
  }

  const allIndices = [...new Set([...cameras.map(c => c.index), 0, 1, 2, 3, 4, 5])].sort((a, b) => a - b)

  return (
    <div className="shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
          border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors">
        <Settings size={13} />
        Phân công camera
        {open
          ? <XCircle size={12} className="text-slate-400" />
          : <span className="text-[10px] text-slate-400">▾</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-80">
          <div className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <Camera size={13} /> Gán index camera cho từng vai trò
          </div>
          <div className="flex flex-col gap-2.5">
            {ROLES.map(({ key, label, accent }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-medium ${accentText[accent]} w-32 shrink-0`}>{label}</span>
                <select
                  value={draft[key]}
                  onChange={e => setDraft(p => ({ ...p, [key]: Number(e.target.value) }))}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50
                    focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {allIndices.map(i => (
                    <option key={i} value={i}>{camLabel(i)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {msg && (
            <p className={`mt-2.5 text-[11px] text-center font-medium
              ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {msg.text}
            </p>
          )}
          <button
            onClick={save} disabled={saving}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold
              bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Đang lưu…" : "Lưu & áp dụng"}
          </button>
        </div>
      )}
    </div>
  )
}

const GATE_STATE_CFG = {
  idle:       { bg: "bg-slate-700/80",   icon: null,                                                           label: "Đang chờ xe…",       cls: "text-slate-300" },
  detecting:  { bg: "bg-amber-800/80",   icon: <Activity size={13} className="text-amber-300 animate-pulse"/>, label: "Phát hiện xe…",      cls: "text-amber-200" },
  processing: { bg: "bg-cyan-900/80",    icon: <Loader2  size={13} className="text-cyan-300 animate-spin"/>,  label: "AI nhận diện…",      cls: "text-cyan-200"  },
  allowed:    { bg: "bg-emerald-700/80", icon: <ShieldCheck size={13} className="text-white"/>,                label: "MỞ CỔNG",            cls: "text-white font-bold" },
  denied:     { bg: "bg-rose-800/80",    icon: <ShieldX  size={13} className="text-rose-200"/>,               label: "TỪ CHỐI",            cls: "text-rose-200 font-bold" },
  error:      { bg: "bg-orange-800/80",  icon: <XCircle  size={13} className="text-orange-300"/>,             label: "Lỗi xử lý",          cls: "text-orange-200" },
}

const EV_COLOR = {
  amber:   "border-amber-700/40   bg-amber-900/20   text-amber-200",
  cyan:    "border-cyan-700/40    bg-cyan-900/20    text-cyan-200",
  emerald: "border-emerald-700/40 bg-emerald-900/20 text-emerald-200",
  rose:    "border-rose-700/40    bg-rose-900/20    text-rose-200",
  violet:  "border-violet-700/40  bg-violet-900/20  text-violet-200",
  orange:  "border-orange-700/40  bg-orange-900/20  text-orange-200",
  slate:   "border-slate-600/40   bg-slate-800/40   text-slate-400",
}
const fmtT = d => new Date(d).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

function GateColumn({ gate, assignment, dispatchRef, onSend }) {
  const isEntry   = gate === "entry"
  const gateLabel = isEntry ? "CỔNG VÀO (ENTRY)" : "CỔNG RA (EXIT)"
  const camP = assignment[isEntry ? "entry_plate" : "exit_plate"] ?? DEFAULT_ASSIGNMENT[isEntry ? "entry_plate" : "exit_plate"]
  const camF = assignment[isEntry ? "entry_face"  : "exit_face" ] ?? DEFAULT_ASSIGNMENT[isEntry ? "entry_face"  : "exit_face" ]
  const accent1 = isEntry ? "blue" : "amber"
  const accent2 = isEntry ? "violet" : "rose"

  const [gateState,   setGateState]   = useState("idle")
  const [stateMsg,    setStateMsg]    = useState("")
  const [plateResult, setPlateResult] = useState(null)
  const [faceResult,  setFaceResult]  = useState(null)
  const [events,      setEvents]      = useState([])
  const [fullP,       setFullP]       = useState(false)
  const [fullF,       setFullF]       = useState(false)
  const resetRef = useRef(null)

  const pushEvent = useCallback(ev => setEvents(p => [ev, ...p].slice(0, 30)), [])

  useEffect(() => {
    dispatchRef.current[gate] = ({ type, data = {} }) => {
      const ts = Date.now()
      clearTimeout(resetRef.current)
      switch (type) {
        case "ENTRY_DETECTED":
        case "EXIT_DETECTED":
          setGateState("detecting"); setStateMsg("")
          pushEvent({ label: isEntry ? "🚗 Xe vào phát hiện" : "🚙 Xe ra phát hiện", color: "amber", ts })
          break
        case "AI_RESULT":
          setGateState("processing")
          setPlateResult({ plate: data.plate || "", confidence: data.plate_confidence || 0 })
          setFaceResult({ matched: !!data.face_user_id, user_id: data.face_user_id, confidence: data.face_confidence || 0 })
          setStateMsg(`${data.plate || "—"} · mặt ${((data.face_confidence || 0) * 100).toFixed(0)}%`)
          pushEvent({ label: `🤖 ${data.plate || "—"} · mặt ${((data.face_confidence||0)*100).toFixed(0)}%`, color: "cyan", ts })
          break
        case "SESSION_CREATED":
          setGateState(data.allowed ? "allowed" : "denied")
          setStateMsg(data.allowed
            ? `${data.user_info?.full_name || "Thành viên"}${data.monthly_pass ? " · Vé tháng" : ""}`
            : data.message || "")
          pushEvent({
            label: data.allowed
              ? `✅ Cho ${isEntry ? "vào" : "ra"}: ${data.user_info?.full_name || "Thành viên"}`
              : `❌ Từ chối: ${data.message || ""}`,
            color: data.allowed ? "emerald" : "rose", ts,
          })
          resetRef.current = setTimeout(() => { setGateState("idle"); setStateMsg(""); setPlateResult(null); setFaceResult(null) }, 8000)
          break
        case "SESSION_CLOSED":
          setGateState("allowed")
          setStateMsg(`Phí: ${Number(data.fee || 0).toLocaleString("vi-VN")}đ`)
          pushEvent({ label: `✅ Ra cổng · Phí: ${Number(data.fee||0).toLocaleString("vi-VN")}đ`, color: "emerald", ts })
          resetRef.current = setTimeout(() => { setGateState("idle"); setStateMsg(""); setPlateResult(null); setFaceResult(null) }, 8000)
          break
        case "BARRIER_OPENED":
          pushEvent({ label: "🔓 Barrier mở", color: "violet", ts })
          break
        case "BARRIER_CLOSED":
          pushEvent({ label: "🔒 Barrier đóng", color: "slate", ts })
          break
        case "ERROR":
          setGateState("error"); setStateMsg(data.message || "Lỗi")
          pushEvent({ label: `⚠️ ${data.message || "Lỗi"}`, color: "orange", ts })
          resetRef.current = setTimeout(() => { setGateState("idle"); setStateMsg("") }, 6000)
          break
        default: break
      }
    }
    return () => { delete dispatchRef.current[gate] }
  }, [gate, isEntry, pushEvent, dispatchRef])

  const stateCfg = GATE_STATE_CFG[gateState] || GATE_STATE_CFG.idle

  return (
    <div className="flex flex-col gap-3">
      {}
      <div className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-bold
        ${isEntry ? "bg-blue-900/30 text-blue-300 border border-blue-800/40"
                  : "bg-amber-900/30 text-amber-300 border border-amber-800/40"}`}>
        {gateLabel}
      </div>

      {}
      <div className="grid grid-cols-2 gap-2" style={{ minHeight: "22vh" }}>
        <CameraBox camIndex={camP} label={isEntry ? "Biển số vào" : "Biển số ra"}
          accent={accent1} resultType="plate" result={plateResult}
          fullscreen={fullP} onToggleFullscreen={() => setFullP(p => !p)} />
        <CameraBox camIndex={camF} label={isEntry ? "Khuôn mặt vào" : "Khuôn mặt ra"}
          accent={accent2} resultType="face" result={faceResult}
          fullscreen={fullF} onToggleFullscreen={() => setFullF(p => !p)} />
      </div>

      {}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors duration-300 ${stateCfg.bg}`}>
        {stateCfg.icon}
        <span className={`text-xs ${stateCfg.cls}`}>{stateCfg.label}</span>
        {stateMsg && <span className="text-white/60 text-[11px] font-mono truncate">{stateMsg}</span>}
      </div>

      {}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onSend(JSON.stringify({ type: "OPEN_BARRIER",  gate }))}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold
            bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors shadow">
          <Unlock size={14} /> Mở barrier
        </button>
        <button onClick={() => onSend(JSON.stringify({ type: "CLOSE_BARRIER", gate }))}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold
            bg-rose-700 hover:bg-rose-600 active:bg-rose-800 text-white transition-colors shadow">
          <Lock size={14} /> Đóng barrier
        </button>
      </div>

      {}
      <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden flex flex-col" style={{ maxHeight: "22vh" }}>
        <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-medium text-gray-400">Sự kiện gần đây</span>
          <span className="text-[10px] text-gray-600">{events.length}</span>
        </div>
        <div className="overflow-y-auto text-[11px] font-mono">
          {events.length === 0
            ? <p className="text-gray-600 text-center py-4 text-xs">Chờ sự kiện…</p>
            : events.map((ev, i) => (
              <div key={i} className={`flex gap-2 px-3 py-1.5 border-b ${EV_COLOR[ev.color] || EV_COLOR.slate}`}>
                <span className="text-gray-500 shrink-0 text-[10px]">{fmtT(ev.ts)}</span>
                <span className="break-words">{ev.label}</span>
              </div>
            ))
          }
        </div>
      </div>

      {(fullP || fullF) && (
        <div className="fixed inset-0 z-40 bg-black/80" onClick={() => { setFullP(false); setFullF(false) }} />
      )}
    </div>
  )
}

function CameraBox({ camIndex, label, accent, resultType, result, fullscreen, onToggleFullscreen }) {
  const [online, setOnline] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const ac = accentCfg[accent]

  useEffect(() => {
    if (online) return
    const t = setTimeout(() => setRetryKey(k => k + 1), 4000)
    return () => clearTimeout(t)
  }, [online, retryKey])

  function Overlay() {
    if (!result) return null
    if (resultType === "plate") {
      const plate = result.plate || ""; const conf = result.confidence || 0; const found = plate.length >= 3
      return (
        <div className={`absolute top-9 left-0 right-0 z-10 mx-3 mt-1 rounded-xl px-3 py-2
          flex items-center justify-between backdrop-blur-sm
          ${found ? "bg-blue-900/85" : "bg-black/60"}`}>
          <div>
            <div className="text-[10px] text-blue-300 font-medium mb-0.5">BIỂN SỐ</div>
            <div className={`font-mono font-bold text-lg leading-none ${found ? "text-white" : "text-white/40"}`}>
              {found ? plate : "— chưa nhận ra —"}
            </div>
          </div>
          <div className="text-right">
            {found ? <CheckCircle2 size={18} className="text-blue-300 mb-0.5" /> : <XCircle size={18} className="text-white/30 mb-0.5" />}
            <div className="text-[10px] text-white/50 font-mono">{(conf * 100).toFixed(0)}%</div>
          </div>
        </div>
      )
    } else {
      const matched = result.matched; const uid = result.user_id; const conf = result.confidence || 0
      return (
        <div className={`absolute top-9 left-0 right-0 z-10 mx-3 mt-1 rounded-xl px-3 py-2
          flex items-center justify-between backdrop-blur-sm
          ${matched ? "bg-violet-900/85" : "bg-black/60"}`}>
          <div>
            <div className="text-[10px] text-violet-300 font-medium mb-0.5">KHUÔN MẶT</div>
            <div className={`font-mono font-bold text-sm leading-tight ${matched ? "text-white" : "text-white/40"}`}>
              {matched ? (uid ? uid.slice(0, 16) + "…" : "OK") : "— không nhận ra —"}
            </div>
          </div>
          <div className="text-right">
            {matched ? <CheckCircle2 size={18} className="text-violet-300 mb-0.5" /> : <XCircle size={18} className="text-white/30 mb-0.5" />}
            <div className="text-[10px] text-white/50 font-mono">{(conf * 100).toFixed(0)}%</div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className={`relative bg-gray-950 rounded-2xl overflow-hidden shadow-xl flex flex-col
      ${fullscreen ? "fixed inset-4 z-50" : ""}
      ring-2 ${ac.ring}`}>
      <div className={`absolute top-0 left-0 right-0 z-20 px-3 py-2
        bg-gradient-to-b ${ac.grad} to-transparent pointer-events-none`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {online
              ? <span className={`w-2 h-2 rounded-full ${ac.dot} animate-pulse`} />
              : <WifiOff size={13} className="text-rose-400" />}
            <span className="text-white text-xs font-semibold drop-shadow">{label}</span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white ${ac.badge}`}>cam {camIndex}</span>
        </div>
      </div>
      <Overlay />
      <div className="flex-1 relative min-h-0 bg-gray-950">
        {}
        <img
          key={retryKey}
          src={`${AI_URL}/stream/${camIndex}`}
          alt={label}
          className="w-full h-full object-cover"
          onLoadStart={() => setOnline(true)}
          onError={() => { setOnline(false); }}
        />
        {!online && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 size={26} className="text-slate-600 animate-spin" />
            <span className="text-slate-500 text-sm">Đang kết nối cam {camIndex}…</span>
          </div>
        )}
      </div>
      <button onClick={onToggleFullscreen}
        className="absolute bottom-2 right-2 z-20 p-1.5 rounded-lg
          bg-black/40 hover:bg-black/70 text-white/60 hover:text-white transition-colors"
        title={fullscreen ? "Thu nhỏ" : "Phóng to"}>
        {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
    </div>
  )
}

export default function Devices() {
  const [devices,        setDevices]        = useState([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [assignment,     setAssignment]     = useState(DEFAULT_ASSIGNMENT)
  const [bridgeConn,     setBridgeConn]     = useState(false)
  const [aiOnline,       setAiOnline]       = useState(false)

  const wsRef       = useRef(null)
  const dispatchRef = useRef({})

  useEffect(() => {
    setLoadingDevices(true)
    devicesApi.list().then(setDevices).catch(() => setDevices([])).finally(() => setLoadingDevices(false))
    const t = setInterval(() => devicesApi.list().then(setDevices).catch(() => {}), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch(`${AI_URL}/cameras/assignment`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAssignment(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    const ping = async () => {
      try { const r = await fetch(`${AI_URL}/health`, { signal: AbortSignal.timeout(2500) }); if (alive) setAiOnline(r.ok) }
      catch { if (alive) setAiOnline(false) }
    }
    ping(); const t = setInterval(ping, 6000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    let ws = null; let retry = null; let destroyed = false
    function connect() {
      if (destroyed) return
      try { ws = new WebSocket(BRIDGE_WS) } catch { return }
      wsRef.current = ws
      ws.onopen  = () => { if (!destroyed) setBridgeConn(true) }
      ws.onclose = () => {
        if (destroyed) return
        setBridgeConn(false)
        wsRef.current = null
        retry = setTimeout(connect, 5000)
      }
      ws.onerror = () => {}
      ws.onmessage = e => {
        if (destroyed) return
        try {
          const msg = JSON.parse(e.data)
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

    retry = setTimeout(connect, 100)
    return () => {
      destroyed = true
      clearTimeout(retry)
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close()
      wsRef.current = null
    }
  }, [])

  const sendWs = useCallback(msg => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg)
  }, [])

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pb-4">

      {}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
            <Camera size={18} className="text-slate-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">Thiết bị &amp; Camera</h2>
            <p className="text-xs text-gray-500">Giám sát trực tiếp – điều khiển barrier cổng vào / ra</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 text-xs ${aiOnline    ? "text-emerald-600" : "text-slate-400"}`}>
            <Activity size={13} /> AI {aiOnline ? "online" : "offline"}
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${bridgeConn ? "text-emerald-600" : "text-slate-400"}`}>
            <Wifi size={13} /> Bridge {bridgeConn ? "kết nối" : "offline"}
          </div>
          <div className="relative">
            <CamAssignPanel assignment={assignment} onSaved={setAssignment} />
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-2 gap-4 shrink-0">
        <DeviceListPanel lane="entry" devices={devices} loading={loadingDevices} />
        <DeviceListPanel lane="exit"  devices={devices} loading={loadingDevices} />
      </div>

      {}
      <div className="grid grid-cols-2 gap-4">
        <GateColumn gate="entry" assignment={assignment} dispatchRef={dispatchRef} onSend={sendWs} />
        <GateColumn gate="exit"  assignment={assignment} dispatchRef={dispatchRef} onSend={sendWs} />
      </div>

    </div>
  )
}

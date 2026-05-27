import { useState, useEffect, useRef } from 'react'
import { Video, VideoOff, RefreshCw, ExternalLink, Settings } from 'lucide-react'

const DEFAULT_BRIDGE = 'https://localhost:4002'

const CAM_LABELS = [
  { index: 0, label: 'Cổng VÀO – Biển số',   color: 'emerald' },
  { index: 1, label: 'Cổng VÀO – Khuôn mặt', color: 'blue' },
]

const COLOR = {
  emerald: 'border-emerald-500 text-emerald-400 bg-emerald-900/20',
  blue:    'border-blue-500 text-blue-400 bg-blue-900/20',
  orange:  'border-orange-500 text-orange-400 bg-orange-900/20',
  purple:  'border-purple-500 text-purple-400 bg-purple-900/20',
}

function CameraFeed({ index, label, color, bridgeUrl }) {
  const imgRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ok | error

  const src = `${bridgeUrl}/stream/${index}`

  useEffect(() => {
    setStatus('loading')
  }, [bridgeUrl])

  return (
    <div className={`rounded-xl border ${COLOR[color]} overflow-hidden flex flex-col bg-gray-900`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-gray-700`}>
        <div className="flex items-center gap-2">
          {status === 'ok'
            ? <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            : status === 'error'
            ? <span className="w-2 h-2 rounded-full bg-red-500" />
            : <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
          <span className={`text-xs font-semibold ${COLOR[color].split(' ')[1]}`}>CAM {index}</span>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Mở full screen"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Stream */}
      <div className="relative bg-black flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
        <img
          ref={imgRef}
          src={src}
          alt={label}
          className="w-full h-full object-contain"
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
          style={{ display: status === 'error' ? 'none' : 'block' }}
        />
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
            <VideoOff size={28} />
            <span className="text-xs">Không thể kết nối</span>
            <span className="text-[11px] text-gray-600">Kiểm tra bridge đang chạy</span>
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
            <RefreshCw size={22} className="animate-spin" />
            <span className="text-xs">Đang kết nối...</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CameraView() {
  const stored = () => localStorage.getItem('bridge_url') || DEFAULT_BRIDGE
  const [bridgeUrl, setBridgeUrl] = useState(stored)
  const [editUrl, setEditUrl]     = useState(stored)
  const [showConfig, setShowConfig] = useState(false)
  const [key, setKey] = useState(0) // force remount streams

  function applyBridgeUrl() {
    const url = editUrl.replace(/\/$/, '')
    localStorage.setItem('bridge_url', url)
    setBridgeUrl(url)
    setShowConfig(false)
    setKey(k => k + 1)
  }

  function reload() { setKey(k => k + 1) }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video size={18} className="text-blue-400" />
          <h1 className="text-lg font-semibold text-white">Camera trực tiếp</h1>
          <span className="text-xs text-gray-500">4 camera</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <RefreshCw size={12} /> Tải lại
          </button>
          <button
            onClick={() => { setEditUrl(bridgeUrl); setShowConfig(v => !v); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Settings size={12} /> Cấu hình
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-200">URL Bridge (Hardware PC)</p>
          <p className="text-xs text-gray-400">
            Bridge server chạy trên máy tính gắn camera. Mặc định:{' '}
            <code className="text-blue-300">https://localhost:4002</code>
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-900 border border-gray-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              placeholder="https://localhost:4002"
            />
            <button
              onClick={applyBridgeUrl}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              Lưu
            </button>
          </div>

          {/* Trust SSL notice */}
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 text-xs text-yellow-300 space-y-1.5">
            <p className="font-semibold">⚠️ Lần đầu sử dụng – cần chấp nhận SSL</p>
            <p>Bridge dùng chứng chỉ tự ký. Bạn cần mở trang sau và chấp nhận cảnh báo bảo mật:</p>
            <a
              href={`${bridgeUrl}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-300 hover:underline"
            >
              <ExternalLink size={11} /> {bridgeUrl}/ (nhấn Advanced → Proceed)
            </a>
            <p className="text-gray-400">Sau đó quay lại và nhấn "Tải lại".</p>
          </div>
        </div>
      )}

      {/* 4 Camera grid */}
      <div key={key} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CAM_LABELS.map(({ index, label, color }) => (
          <CameraFeed
            key={`${bridgeUrl}-${index}`}
            index={index}
            label={label}
            color={color}
            bridgeUrl={bridgeUrl}
          />
        ))}
      </div>

      <p className="text-xs text-gray-600 text-center">
        Stream MJPEG 640×480 @ 10fps · qua Bridge HTTPS proxy · AI Service cổng 5001
      </p>
    </div>
  )
}

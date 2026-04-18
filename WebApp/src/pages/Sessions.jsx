import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { History, Clock, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react';

const STATUS_OPTS = [
  { value: '',          label: 'Tất cả' },
  { value: 'active',    label: 'Đang gửi' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'abnormal',  label: 'Bất thường' },
];

function fmtCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  if (status === 'active')    return <span className="badge-active">Đang gửi</span>;
  if (status === 'completed') return <span className="badge-completed">Hoàn thành</span>;
  if (status === 'abnormal')  return <span className="badge-abnormal">Bất thường</span>;
  return null;
}

export default function Sessions() {
  const { sessions, sessionsTotal, sessionsPage, fetchSessions } = useStore();
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPage(1);
  }, [filter]);

  async function loadPage(page) {
    setLoading(true);
    await fetchSessions(page, filter || undefined);
    setLoading(false);
  }

  const totalPages = Math.ceil(sessionsTotal / 10);

  return (
    <div className="p-4 space-y-4">
      {}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${filter === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {}
      <p className="text-sm text-slate-400">{sessionsTotal} phiên gửi xe</p>

      {loading && (
        <div className="text-center py-8 text-slate-400 text-sm">Đang tải...</div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <History size={40} className="mx-auto mb-3 opacity-30" />
          <p>Không có phiên gửi xe nào</p>
        </div>
      )}

      {}
      <div className="space-y-3">
        {sessions.map(s => (
          <div key={s.id} className="card">
            <div
              className="flex items-start justify-between cursor-pointer"
              onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{s.license_plate}</span>
                  {s.vehicle_nickname && (
                    <span className="text-xs text-slate-400">({s.vehicle_nickname})</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <Clock size={11} /> {fmtDateTime(s.entry_time)}
                </p>
                {s.lot_name && <p className="text-xs text-blue-500 mt-0.5">{s.lot_name}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <StatusBadge status={s.status} />
                <ChevronDown
                  size={16}
                  className={`text-slate-300 transition-transform ${expandedId === s.id ? 'rotate-180' : ''}`}
                />
              </div>
            </div>

            {expandedId === s.id && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-sm">
                <Row label="Biển số" value={s.license_plate} />
                <Row label="Thời gian vào" value={fmtDateTime(s.entry_time)} />
                <Row label="Thời gian ra" value={fmtDateTime(s.exit_time)} />
                <Row label="Thời gian gửi"
                  value={s.duration_minutes != null ? `${s.duration_minutes} phút` : '—'} />
                <Row label="Phí" value={fmtCurrency(s.fee)} highlight />
                {s.abnormal_reason && (
                  <div className="flex items-start gap-1 text-red-600">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs">{s.abnormal_reason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={sessionsPage <= 1}
            onClick={() => loadPage(sessionsPage - 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40"
          >
            Trước
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-500">
            {sessionsPage} / {totalPages}
          </span>
          <button
            disabled={sessionsPage >= totalPages}
            onClick={() => loadPage(sessionsPage + 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40"
          >
            Tiếp
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-blue-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  Wallet, Car, History, ShieldCheck, Clock,
  CheckCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';

function fmtCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, wallet, activeSessions, vehicles, fetchMe, fetchWallet, fetchActiveSessions, fetchVehicles } = useStore();

  useEffect(() => {
    fetchMe();
    fetchWallet();
    fetchActiveSessions();
    fetchVehicles();
  }, []);

  const threshold = wallet?.low_balance_threshold;
  const isLowBalance = wallet != null
    && typeof wallet.balance === 'number'
    && typeof threshold === 'number' && threshold > 0
    && wallet.balance < threshold;

  return (
    <div className="p-4 space-y-4">
      {}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-5 text-white">
        <p className="text-blue-100 text-sm">Xin chào,</p>
        <h2 className="text-xl font-bold mt-0.5">{currentUser?.full_name || '—'}</h2>
        <p className="text-blue-200 text-xs mt-1">{currentUser?.phone_number}</p>
      </div>

      {}
      <div
        className="card cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate('/wallet')}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <Wallet size={16} /> Số dư ví
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </div>
        <p className={`text-2xl font-bold ${isLowBalance ? 'text-red-500' : 'text-slate-800'}`}>
          {fmtCurrency(wallet?.balance)}
        </p>
        {isLowBalance && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle size={12} /> Số dư thấp – hãy nạp thêm
          </p>
        )}
      </div>

      {}
      {activeSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Xe đang gửi ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.map(s => (
              <div key={s.id} className="card border-l-4 border-l-green-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{s.license_plate}</p>
                    {s.vehicle_nickname && (
                      <p className="text-xs text-slate-500">{s.vehicle_nickname}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock size={11} /> Vào lúc {fmtTime(s.entry_time)}
                    </p>
                    {s.lot_name && <p className="text-xs text-blue-500 mt-0.5">{s.lot_name}</p>}
                  </div>
                  <span className="badge-active">Đang gửi</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/wallet')}
          className="card flex flex-col items-center gap-2 py-5 hover:bg-blue-50 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Wallet size={20} className="text-blue-600" />
          </div>
          <span className="text-sm font-medium text-slate-700">Nạp tiền</span>
        </button>

        <button
          onClick={() => navigate('/vehicles')}
          className="card flex flex-col items-center gap-2 py-5 hover:bg-blue-50 transition-colors"
        >
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <Car size={20} className="text-indigo-600" />
          </div>
          <span className="text-sm font-medium text-slate-700">Quản lý xe</span>
        </button>

        <button
          onClick={() => navigate('/sessions')}
          className="card flex flex-col items-center gap-2 py-5 hover:bg-blue-50 transition-colors"
        >
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <History size={20} className="text-green-600" />
          </div>
          <span className="text-sm font-medium text-slate-700">Lịch sử gửi xe</span>
        </button>

        <button
          onClick={() => navigate('/authorizations')}
          className="card flex flex-col items-center gap-2 py-5 hover:bg-blue-50 transition-colors"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <ShieldCheck size={20} className="text-purple-600" />
          </div>
          <span className="text-sm font-medium text-slate-700">Ủy quyền</span>
        </button>
      </div>

      {}
      {vehicles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Xe của tôi</h3>
            <button onClick={() => navigate('/vehicles')} className="text-xs text-blue-600 font-medium">Xem tất cả</button>
          </div>
          <div className="space-y-2">
            {vehicles.slice(0, 3).map(v => (
              <div key={v.id} className="card flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Car size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{v.license_plate}</p>
                  {v.nickname && <p className="text-xs text-slate-400 truncate">{v.nickname}</p>}
                </div>
                {v.is_active
                  ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  : <span className="text-xs text-slate-400">Ngừng</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

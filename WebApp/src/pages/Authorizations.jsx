import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ShieldCheck, ShieldOff, Car, Clock, Trash2 } from 'lucide-react';

function fmtDate(dt) {
  if (!dt) return 'Vĩnh viễn';
  return new Date(dt).toLocaleDateString('vi-VN');
}

const AUTH_TYPE_LABEL = { once: '1 lần', daily: 'Trong ngày', permanent: 'Vĩnh viễn' };

export default function Authorizations() {
  const { authorizations, fetchAuthorizations, revokeAuthorization } = useStore();

  useEffect(() => { fetchAuthorizations(); }, []);

  async function handleRevoke(id, name) {
    if (!confirm(`Thu hồi ủy quyền cho "${name || 'người này'}"?`)) return;
    try { await revokeAuthorization(id); }
    catch (err) { alert(err.message); }
  }

  const active   = authorizations.filter(a => a.is_active && !a.is_consumed);
  const inactive = authorizations.filter(a => !a.is_active || a.is_consumed);

  return (
    <div className="p-4 space-y-5">
      {}
      <div className="card bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-700">
          <span className="font-semibold">Ủy quyền lấy xe</span> cho phép người khác lấy xe của bạn tại bãi
          mà không cần tài khoản hệ thống. Tính năng đăng ký ủy quyền mới yêu cầu chụp ảnh khuôn mặt –
          thực hiện qua ứng dụng di động hoặc quầy bãi xe.
        </p>
      </div>

      {}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Đang hiệu lực ({active.length})
        </h3>
        {active.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <ShieldCheck size={32} className="mx-auto mb-2 opacity-30" />
            <p>Chưa có ủy quyền nào đang hoạt động</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(a => (
              <div key={a.id} className="card border-l-4 border-l-green-400">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{a.delegate_name || 'Không tên'}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <Car size={11} />
                      <span>{a.license_plate}</span>
                      {a.vehicle_nickname && <span>({a.vehicle_nickname})</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {AUTH_TYPE_LABEL[a.auth_type]}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-0.5">
                        <Clock size={10} /> Đến {fmtDate(a.valid_until)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(a.id, a.delegate_name)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                    title="Thu hồi"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {}
      {inactive.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Đã hết hiệu lực ({inactive.length})
          </h3>
          <div className="space-y-2">
            {inactive.map(a => (
              <div key={a.id} className="card opacity-60">
                <div className="flex items-center gap-3">
                  <ShieldOff size={16} className="text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-600">{a.delegate_name || 'Không tên'}</p>
                    <p className="text-xs text-slate-400">{a.license_plate}</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {a.is_consumed ? 'Đã dùng' : 'Đã thu hồi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

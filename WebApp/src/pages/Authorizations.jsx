import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { ShieldCheck, ShieldOff, Car, Clock, Trash2, Plus, X, Phone, User } from 'lucide-react';

function fmtDate(dt) {
  if (!dt) return 'Vĩnh viễn';
  return new Date(dt).toLocaleDateString('vi-VN');
}

const AUTH_TYPE_LABEL = { once: '1 lần', daily: 'Trong ngày', permanent: 'Vĩnh viễn' };

export default function Authorizations() {
  const { authorizations, fetchAuthorizations, revokeAuthorization, addAuthorization, vehicles, fetchVehicles } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ phone_number: '', vehicle_id: '', auth_type: 'permanent', valid_until: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => { fetchAuthorizations(); fetchVehicles(); }, []);

  async function handleRevoke(id, name) {
    if (!confirm(`Thu hồi ủy quyền cho "${name || 'người này'}"?`)) return;
    try { await revokeAuthorization(id); }
    catch (err) { alert(err.message); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    if (!addForm.phone_number.trim()) { setAddError('Nhập số điện thoại của người được ủy quyền'); return; }
    if (!addForm.vehicle_id) { setAddError('Chọn xe cần ủy quyền'); return; }
    setAddLoading(true);
    try {
      await addAuthorization({
        phone_number: addForm.phone_number.trim(),
        vehicle_id: addForm.vehicle_id,
        auth_type: addForm.auth_type,
        valid_until: addForm.valid_until || undefined,
      });
      setShowAdd(false);
      setAddForm({ phone_number: '', vehicle_id: '', auth_type: 'permanent', valid_until: '' });
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  }

  const activeVehicles = (vehicles || []).filter(v => v.is_active);
  const active   = authorizations.filter(a => a.is_active && !a.is_consumed);
  const inactive = authorizations.filter(a => !a.is_active || a.is_consumed);

  return (
    <div className="p-4 space-y-5">
      {/* Add authorization form */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 font-medium">Ủy quyền lấy xe</p>
        <button
          onClick={() => { setShowAdd(v => !v); setAddError(''); }}
          className="flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-blue-700"
        >
          <Plus size={15} /> Thêm ủy quyền
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card border-2 border-blue-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><User size={16} /> Thêm ủy quyền mới</h3>
            <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <p className="text-xs text-slate-500">Nhập số điện thoại của người bạn muốn ủy quyền để lấy xe thay bạn.</p>
          {addError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{addError}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Phone size={13} /> Số điện thoại người được ủy quyền *</label>
            <input
              className="input-field font-mono"
              placeholder="Ví dụ: 0912345678"
              value={addForm.phone_number}
              onChange={e => setAddForm(f => ({ ...f, phone_number: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Car size={13} /> Xe được ủy quyền *</label>
            <select
              className="input-field"
              value={addForm.vehicle_id}
              onChange={e => setAddForm(f => ({ ...f, vehicle_id: e.target.value }))}
              required
            >
              <option value="">-- Chọn xe --</option>
              {activeVehicles.map(v => (
                <option key={v.id} value={v.id}>{v.license_plate}{v.nickname ? ` (${v.nickname})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại ủy quyền *</label>
            <select
              className="input-field"
              value={addForm.auth_type}
              onChange={e => setAddForm(f => ({ ...f, auth_type: e.target.value }))}
            >
              <option value="permanent">Vĩnh viễn</option>
              <option value="daily">Trong ngày</option>
              <option value="once">1 lần</option>
            </select>
          </div>
          {addForm.auth_type !== 'permanent' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hết hạn</label>
              <input
                type="datetime-local"
                className="input-field"
                value={addForm.valid_until}
                onChange={e => setAddForm(f => ({ ...f, valid_until: e.target.value }))}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={addLoading} className="btn-primary py-2">
              {addLoading ? 'Đang tạo...' : 'Tạo ủy quyền'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary py-2">Hủy</button>
          </div>
        </form>
      )}

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
                    <p className="font-semibold text-slate-800">
                      {a.delegate_full_name || a.delegate_name || 'Không tên'}
                    </p>
                    {a.delegate_phone && (
                      <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                        <Phone size={10} /> {a.delegate_phone}
                      </p>
                    )}
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
                    onClick={() => handleRevoke(a.id, a.delegate_full_name || a.delegate_name)}
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
                    <p className="text-sm font-medium text-slate-600">{a.delegate_full_name || a.delegate_name || 'Không tên'}</p>
                    <p className="text-xs text-slate-400 font-mono">{a.license_plate}</p>
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

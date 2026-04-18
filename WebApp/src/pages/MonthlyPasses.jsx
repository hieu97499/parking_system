import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { monthlyPassesApi } from '../api/services';
import { CalendarCheck, Plus, X, Trash2, Car, MapPin, Calendar } from 'lucide-react';

const fmtCurrency = n => n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

function StatusBadge({ status }) {
  const map = {
    active:    { label: 'Đang hiệu lực', cls: 'bg-green-100 text-green-700' },
    expired:   { label: 'Hết hạn',       cls: 'bg-slate-100 text-slate-500' },
    cancelled: { label: 'Đã huỷ',        cls: 'bg-red-100 text-red-600'    },
  };
  const { label, cls } = map[status] || map.expired;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

export default function MonthlyPasses() {
  const { vehicles, fetchVehicles, wallet, fetchWallet } = useStore();

  const [passes, setPasses]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [price, setPrice]         = useState(200000);
  const [showBuy, setShowBuy]     = useState(false);
  const [form, setForm]           = useState({ vehicle_id: '', lot_id: '', months: 1 });
  const [lots, setLots]           = useState([]);
  const [buying, setBuying]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  useEffect(() => {
    fetchVehicles();
    fetchWallet();
    loadPasses();
    loadPrice();
    loadLots();
  }, []);

  async function loadPasses() {
    setLoading(true);
    try { setPasses(await monthlyPassesApi.list()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadPrice() {
    try { const d = await monthlyPassesApi.price(); setPrice(d.price); } catch {}
  }

  async function loadLots() {
    try {

      const res = await fetch('/api/user/parking-lots', {
        headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` }
      });
      if (res.ok) { const d = await res.json(); setLots(d); }
    } catch {}
  }

  async function handleBuy(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.vehicle_id) { setError('Vui lòng chọn xe'); return; }
    setBuying(true);
    try {
      const data = await monthlyPassesApi.buy(form);
      setSuccess(data.message);
      setShowBuy(false);
      setForm({ vehicle_id: '', lot_id: form.lot_id, months: 1 });
      await loadPasses();
      await fetchWallet();
    } catch (e) { setError(e.message); }
    finally { setBuying(false); }
  }

  async function handleCancel(passId, plate) {
    if (!confirm(`Huỷ vé tháng xe ${plate}? Số tiền còn lại sẽ được hoàn vào ví.`)) return;
    setError(''); setSuccess('');
    try {
      const data = await monthlyPassesApi.cancel(passId);
      setSuccess(data.message);
      await loadPasses();
      await fetchWallet();
    } catch (e) { setError(e.message); }
  }

  const activeVehicles = vehicles.filter(v => v.is_active);
  const totalFee = price * (form.months || 1);

  return (
    <div className="p-4 space-y-4">
      {}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Vé tháng</h2>
          <p className="text-xs text-slate-400">{fmtCurrency(price)}/tháng/xe</p>
        </div>
        <button
          onClick={() => { setShowBuy(v => !v); setError(''); setSuccess(''); }}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700"
        >
          <Plus size={15} /> Mua vé
        </button>
      </div>

      {}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{success}</div>}
      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}

      {}
      {showBuy && (
        <form onSubmit={handleBuy} className="card border-2 border-blue-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Đăng ký vé tháng</h3>
            <button type="button" onClick={() => setShowBuy(false)}><X size={18} className="text-slate-400" /></button>
          </div>

          {}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Chọn xe</label>
            {activeVehicles.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có xe đăng ký</p>
            ) : (
              <div className="space-y-2">
                {activeVehicles.map(v => (
                  <label key={v.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    form.vehicle_id === v.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                  }`}>
                    <input
                      type="radio" name="vehicle" value={v.id}
                      checked={form.vehicle_id === v.id}
                      onChange={() => setForm(f => ({ ...f, vehicle_id: v.id }))}
                      className="accent-blue-600"
                    />
                    <Car size={16} className="text-slate-400" />
                    <div>
                      <p className="font-mono font-semibold text-slate-800 text-sm">{v.license_plate}</p>
                      {v.nickname && <p className="text-xs text-slate-400">{v.nickname}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {}
          {lots.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bãi đỗ xe</label>
              <select
                value={form.lot_id}
                onChange={e => setForm(f => ({ ...f, lot_id: e.target.value }))}
                required
                className="input-field"
              >
                <option value="">-- Chọn bãi đỗ --</option>
                {lots.map(l => (
                  <option key={l.lot_id} value={l.lot_id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Số tháng</label>
            <div className="flex gap-2">
              {[1, 2, 3, 6].map(m => (
                <button
                  type="button" key={m}
                  onClick={() => setForm(f => ({ ...f, months: m }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    form.months === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {m} tháng
                </button>
              ))}
            </div>
          </div>

          {}
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Đơn giá</span>
              <span>{fmtCurrency(price)}/tháng</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-slate-500">Số tháng</span>
              <span>{form.months} tháng</span>
            </div>
            <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-slate-200">
              <span>Tổng cộng</span>
              <span className="text-blue-600">{fmtCurrency(totalFee)}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Số dư ví: {fmtCurrency(wallet?.balance)}
              {wallet?.balance < totalFee && (
                <span className="text-red-500 ml-1">– không đủ</span>
              )}
            </p>
          </div>

          <button
            type="submit"
            disabled={buying || !form.vehicle_id || (wallet?.balance < totalFee)}
            className="btn-primary disabled:opacity-60"
          >
            {buying ? 'Đang xử lý...' : `Thanh toán ${fmtCurrency(totalFee)}`}
          </button>
        </form>
      )}

      {}
      {loading ? (
        <p className="text-center text-slate-400 py-10">Đang tải...</p>
      ) : passes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CalendarCheck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Chưa có vé tháng nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {passes.map(p => (
            <div key={p.pass_id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                    <Car size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-slate-800">{p.license_plate}</p>
                    {p.vehicle_nickname && <p className="text-xs text-slate-400">{p.vehicle_nickname}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  {p.status === 'active' && (
                    <button
                      onClick={() => handleCancel(p.pass_id, p.license_plate)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                {p.lot_name && (
                  <div className="flex items-center gap-1">
                    <MapPin size={11} /> {p.lot_name}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar size={11} /> {fmtDate(p.valid_from)} → {fmtDate(p.valid_until)}
                </div>
                <div className="col-span-2 text-right font-semibold text-slate-700">
                  Phí: {fmtCurrency(p.fee_paid)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

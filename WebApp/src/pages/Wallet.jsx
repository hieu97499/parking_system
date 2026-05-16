import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { walletApi, withdrawApi } from '../api/services';
import { Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, Plus, X, Banknote, Clock, Copy, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

function fmtCurrency(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000];

function TxIcon({ type }) {
  if (type === 'topup')  return <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center"><ArrowDownLeft size={18} className="text-green-600" /></div>;
  if (type === 'deduct') return <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center"><ArrowUpRight size={18} className="text-red-500" /></div>;
  if (type === 'refund') return <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center"><RefreshCw size={18} className="text-blue-600" /></div>;
  return <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center"><ArrowUpRight size={18} className="text-slate-500" /></div>;
}

const TX_LABEL = {
  topup: 'Nạp tiền', deduct: 'Phí gửi xe', withdraw: 'Rút tiền', refund: 'Hoàn tiền',
};

export default function WalletPage() {
  const { wallet, walletTransactions, walletTotal, walletPage, fetchWallet, fetchTransactions } = useStore();
  const [showTopup, setShowTopup]       = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');

  // SePay QR state
  const [qrData, setQrData]   = useState(null);
  const [copied, setCopied]   = useState('');
  const pollRef               = useRef(null);

  // Transaction filter
  const _now = new Date();
  const initFilter = { year: _now.getFullYear(), month: _now.getMonth() + 1, type: 'all' };
  const [txFilter, setTxFilter] = useState(initFilter);
  const txFilterRef             = useRef(initFilter);

  function applyFilter(f) {
    setTxFilter(f);
    txFilterRef.current = f;
    fetchTransactions(1, f);
  }
  function prevMonth() {
    const base = txFilter.year
      ? new Date(txFilter.year, txFilter.month - 2)
      : new Date(_now.getFullYear(), _now.getMonth() - 1);
    applyFilter({ ...txFilterRef.current, year: base.getFullYear(), month: base.getMonth() + 1 });
  }
  function nextMonth() {
    if (!txFilter.year) return;
    const next = new Date(txFilter.year, txFilter.month);
    if (next > new Date(_now.getFullYear(), _now.getMonth())) return;
    applyFilter({ ...txFilterRef.current, year: next.getFullYear(), month: next.getMonth() + 1 });
  }
  const isNextDisabled = !txFilter.year || (txFilter.year === _now.getFullYear() && txFilter.month === _now.getMonth() + 1);

  const [wForm, setWForm]   = useState({ amount: '', bank_name: '', bank_account: '', account_name: '' });
  const [wLoading, setWLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    fetchWallet();
    fetchTransactions(1, txFilterRef.current);
    withdrawApi.history().then(r => setWithdrawals(r || [])).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  async function handleWithdraw(e) {
    e.preventDefault();
    setWLoading(true);
    setError(''); setSuccess('');
    try {
      const amt = parseInt(wForm.amount.replace(/\D/g, ''), 10);
      await withdrawApi.request({ ...wForm, amount: amt });
      setSuccess('Yêu cầu rút tiền đã được gửi, chờ admin xử lý.');
      setWForm({ amount: '', bank_name: '', bank_account: '', account_name: '' });
      setShowWithdraw(false);
      fetchWallet();
      const r = await withdrawApi.history();
      setWithdrawals(r || []);
    } catch (err) { setError(err.message); }
    finally { setWLoading(false); }
  }

  async function handleTopup(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    const num = parseInt(amount, 10);
    if (!num || num < 10000) { setError('Nhập số tiền tối thiểu 10,000đ'); return; }
    setLoading(true);
    try {
      const res = await walletApi.sepayCreate({ amount: num });
      setQrData(res);
      // Bắt đầu poll trạng thái mỗi 5 giây
      pollRef.current = setInterval(async () => {
        try {
          const s = await walletApi.sepayStatus(res.ref_code);
          if (s.status === 'success') {
            clearInterval(pollRef.current);
            setQrData(null);
            setShowTopup(false);
            setAmount('');
            setSuccess(`Nạp thành công ${fmtCurrency(s.amount)}! Số dư mới: ${fmtCurrency(s.balance_after)}`);
            fetchWallet();
            fetchTransactions(1, txFilterRef.current);
          }
        } catch (_) {}
      }, 5000);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function closeQr() {
    clearInterval(pollRef.current);
    setQrData(null);
    setShowTopup(false);
    setAmount('');
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  const totalPages = Math.ceil(walletTotal / 20);

  return (
    <div className="p-4 space-y-4">
      {}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
        <p className="text-blue-200 text-sm">Số dư hiện tại</p>
        <p className="text-3xl font-bold mt-1">{fmtCurrency(wallet?.balance)}</p>
        <button
          onClick={() => { setShowTopup(v => !v); setShowWithdraw(false); setError(''); setSuccess(''); }}
          className="mt-4 flex items-center gap-1.5 bg-white text-blue-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-50"
        >
          <Plus size={16} /> Nạp tiền
        </button>
        <button
          onClick={() => { setShowWithdraw(v => !v); setShowTopup(false); setError(''); setSuccess(''); }}
          className="mt-2 flex items-center gap-1.5 bg-blue-700 bg-opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-opacity-70"
        >
          <Banknote size={16} /> Rút tiền
        </button>
      </div>

      {}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{success}</div>
      )}

      {}
      {showTopup && !qrData && (
        <form onSubmit={handleTopup} className="card border-2 border-blue-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Nạp tiền vào ví</h3>
            <button type="button" onClick={() => { setShowTopup(false); setError(''); }}><X size={18} className="text-slate-400" /></button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {}
          <div>
            <p className="text-sm text-slate-500 mb-2">Chọn nhanh</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_AMOUNTS.map(a => (
                <button
                  type="button" key={a}
                  onClick={() => setAmount(a.toString())}
                  className={`py-2 rounded-xl text-sm font-medium border transition-colors
                    ${amount === a.toString()
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  {fmtCurrency(a)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hoặc nhập số tiền (VND)</label>
            <input
              type="number"
              className="input-field"
              placeholder="100000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={10000}
              max={10000000}
              required
            />
          </div>

          <p className="text-xs text-slate-400 flex items-center gap-1">
            <img src="https://sepay.vn/favicon.ico" className="w-4 h-4" alt="" onError={e => e.target.style.display='none'} />
            Thanh toán qua chuyển khoản ngân hàng (SePay)
          </p>

          <button type="submit" disabled={loading || !amount} className="btn-primary">
            {loading ? 'Đang tạo QR...' : `Tạo mã QR – ${amount ? fmtCurrency(parseInt(amount, 10)) : ''}`}
          </button>
        </form>
      )}

      {}
      {qrData && (
        <div className="card border-2 border-blue-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Quét QR để chuyển khoản</h3>
            <button type="button" onClick={closeQr}><X size={18} className="text-slate-400" /></button>
          </div>

          <div className="flex justify-center">
            <img
              src={qrData.qr_url}
              alt="QR chuyển khoản"
              className="w-52 h-52 rounded-xl border border-slate-200"
            />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs text-slate-400">Ngân hàng</p>
                <p className="font-medium text-slate-800">{qrData.bank_code} — {qrData.account_name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs text-slate-400">Số tài khoản</p>
                <p className="font-medium text-slate-800">{qrData.bank_account}</p>
              </div>
              <button onClick={() => copyText(qrData.bank_account, 'acc')} className="text-blue-500 hover:text-blue-700 ml-2">
                {copied === 'acc' ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs text-slate-400">Số tiền</p>
                <p className="font-semibold text-blue-600">{fmtCurrency(qrData.amount)}</p>
              </div>
              <button onClick={() => copyText(String(qrData.amount), 'amt')} className="text-blue-500 hover:text-blue-700 ml-2">
                {copied === 'amt' ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs text-yellow-600 font-semibold">Nội dung chuyển khoản (bắt buộc)</p>
                <p className="font-bold text-slate-800 tracking-wide">{qrData.ref_code}</p>
              </div>
              <button onClick={() => copyText(qrData.ref_code, 'ref')} className="text-blue-500 hover:text-blue-700 ml-2">
                {copied === 'ref' ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            Số dư sẽ được cộng tự động sau khi chuyển khoản thành công
          </p>
        </div>
      )}

      {}
      {showWithdraw && (
        <form onSubmit={handleWithdraw} className="card border-2 border-orange-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Rút tiền về tài khoản</h3>
            <button type="button" onClick={() => setShowWithdraw(false)}><X size={18} className="text-slate-400" /></button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền rút (VND)</label>
            <input type="number" className="input-field" placeholder="Tối thiểu 10,000đ" min={10000}
              value={wForm.amount} onChange={e => setWForm(f => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngân hàng</label>
            <input type="text" className="input-field" placeholder="VD: Vietcombank, BIDV..." maxLength={100}
              value={wForm.bank_name} onChange={e => setWForm(f => ({ ...f, bank_name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số tài khoản</label>
            <input type="text" className="input-field" placeholder="Số tài khoản ngân hàng" maxLength={50}
              value={wForm.bank_account} onChange={e => setWForm(f => ({ ...f, bank_account: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên chủ tài khoản</label>
            <input type="text" className="input-field" placeholder="Họ và tên" maxLength={100}
              value={wForm.account_name} onChange={e => setWForm(f => ({ ...f, account_name: e.target.value }))} required />
          </div>
          <button type="submit" disabled={wLoading} className="btn-primary bg-orange-500 hover:bg-orange-600">
            {wLoading ? 'Đang xử lý...' : 'Gửi yêu cầu rút tiền'}
          </button>
        </form>
      )}

      {}
      {withdrawals.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
            <Clock size={14} /> Yêu cầu rút tiền ({withdrawals.length})
          </p>
          <div className="space-y-2">
            {withdrawals.map(w => {
              const statusMap = {
                pending:   { label: 'Đang xử lý', cls: 'bg-yellow-100 text-yellow-700' },
                approved:  { label: 'Đã duyệt',   cls: 'bg-green-100 text-green-700' },
                rejected:  { label: 'Từ chối',    cls: 'bg-red-100 text-red-600' },
              };
              const s = statusMap[w.status] || { label: w.status, cls: 'bg-slate-100 text-slate-600' };
              return (
                <div key={w.request_id} className="card flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Banknote size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{w.bank_name} – {w.bank_account}</p>
                    <p className="text-xs text-slate-400">{w.account_name}</p>
                    <p className="text-xs text-slate-300">{fmtDateTime(w.created_at)}</p>
                    {w.admin_note && <p className="text-xs text-slate-500 mt-0.5">GC: {w.admin_note}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="font-semibold text-sm text-red-500">-{fmtCurrency(w.amount)}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction history with filter */}
      <div>
        {/* Filter bar */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => txFilter.year
                ? applyFilter({ ...txFilterRef.current, year: null, month: null })
                : applyFilter({ ...txFilterRef.current, year: _now.getFullYear(), month: _now.getMonth() + 1 })
              }
              className={`flex-1 text-sm font-semibold py-2 rounded-xl border text-center transition-colors ${
                txFilter.year ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {txFilter.year ? `Tháng ${txFilter.month}/${txFilter.year}` : 'Tất cả thời gian'}
            </button>
            <button onClick={nextMonth} disabled={isNextDisabled} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[['all','Tất cả'], ['topup','Nạp tiền'], ['deduct','Gửi xe'], ['refund','Hoàn tiền'], ['withdraw','Rút tiền']].map(([val, label]) => (
              <button key={val}
                onClick={() => applyFilter({ ...txFilterRef.current, type: val })}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  txFilter.type === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Lịch sử giao dịch ({walletTotal})
        </p>

        {walletTransactions.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Chưa có giao dịch nào</div>
        ) : (
          <div className="space-y-2">
            {walletTransactions.map(t => (
              <div key={t.id} className="card flex items-center gap-3">
                <TxIcon type={t.transaction_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {TX_LABEL[t.transaction_type] || t.transaction_type}
                  </p>
                  {t.session_plate && (
                    <p className="text-xs text-slate-400">{t.session_plate}</p>
                  )}
                  <p className="text-xs text-slate-300">{fmtDateTime(t.created_at)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-semibold text-sm ${
                    t.status === 'pending' ? 'text-slate-400' :
                    t.transaction_type === 'topup' || t.transaction_type === 'refund' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {t.transaction_type === 'topup' || t.transaction_type === 'refund' ? '+' : '-'}
                    {fmtCurrency(t.amount)}
                  </p>
                  {t.status === 'pending'
                    ? <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Đang xử lý</span>
                    : <p className="text-xs text-slate-400">{fmtCurrency(t.balance_after)}</p>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button disabled={walletPage <= 1} onClick={() => fetchTransactions(walletPage - 1, txFilter)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40">Trước</button>
            <span className="px-3 py-1.5 text-sm text-slate-500">{walletPage} / {totalPages}</span>
            <button disabled={walletPage >= totalPages} onClick={() => fetchTransactions(walletPage + 1, txFilter)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40">Tiếp</button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react'
import { usersApi } from '../api/services'
import {
  Search, X, User, Wallet, Car, Clock,
  ChevronDown, ChevronUp, Edit2, Save, AlertCircle, CheckCircle, ScanFace
} from 'lucide-react'
import clsx from 'clsx'

const fmtVND  = n => (n ?? 0).toLocaleString('vi-VN') + 'đ'
const fmtDate = d => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtTime = d => new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function StatusBadge({ active }) {
  return active
    ? <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">Hoạt động</span>
    : <span className="bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded-full font-medium">Vô hiệu</span>
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
    )}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg}
    </div>
  )
}

export default function Users() {
  const [users, setUsers]         = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [sortDir, setSortDir]     = useState('desc')
  const [detail, setDetail]       = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [editing, setEditing]     = useState(false)
  const [editForm, setEditForm]   = useState({ full_name: '', phone_number: '', is_active: true })
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [faceImages, setFaceImages]     = useState([])
  const [faceLoading, setFaceLoading]   = useState(false)
  const [previewImg, setPreviewImg]     = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (search) params.search = search
      const res = await usersApi.list(params)
      let data = res.data || []
      data = [...data].sort((a, b) =>
        sortDir === 'desc'
          ? new Date(b.created_at) - new Date(a.created_at)
          : new Date(a.created_at) - new Date(b.created_at)
      )
      setUsers(data)
      setTotal(res.total || data.length)
    } catch (e) {
      setToast({ msg: 'Lỗi tải danh sách: ' + e.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [search, sortDir])

  useEffect(() => {
    const t = setTimeout(loadUsers, 300)
    return () => clearTimeout(t)
  }, [loadUsers])

  const openDetail = async (user) => {
    setEditing(false)
    setDetailTab('info')
    setFaceImages([])
    try {
      const data = await usersApi.get(user.id)
      setDetail(data)
    } catch (e) {
      setToast({ msg: 'Lỗi tải thông tin: ' + e.message, type: 'error' })
    }
  }

  const loadFaceImages = async (uid) => {
    setFaceLoading(true)
    try {
      const data = await usersApi.faceImages(uid)
      setFaceImages(Array.isArray(data) ? data : [])
    } catch (e) {
      setToast({ msg: 'Lỗi tải ảnh khuôn mặt: ' + e.message, type: 'error' })
    } finally {
      setFaceLoading(false)
    }
  }

  const startEdit = () => {
    setEditForm({ full_name: detail.full_name, phone_number: detail.phone_number, is_active: detail.is_active })
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const updated = await usersApi.update(detail.id || detail.user_id, editForm)
      setDetail(prev => ({ ...prev, ...updated }))
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u))
      setEditing(false)
      setToast({ msg: 'Cập nhật thành công', type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (uid) => {
    try {
      const updated = await usersApi.toggleActive(uid)
      setDetail(prev => ({ ...prev, is_active: updated.is_active }))
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, is_active: updated.is_active } : u))
      setToast({ msg: updated.is_active ? 'Đã kích hoạt tài khoản' : 'Đã vô hiệu hóa tài khoản', type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    }
  }

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, số điện thoại..."
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="text-sm text-gray-500">{total} người dùng</div>
      </div>

      {}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Họ tên</th>
                <th className="px-5 py-3 text-left font-medium">Số điện thoại</th>
                <th className="px-5 py-3 text-left font-medium">Số dư ví</th>
                <th className="px-5 py-3 text-left font-medium">Xe đăng ký</th>
                <th className="px-5 py-3 text-left font-medium">
                  <button
                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Ngày đăng ký
                    {sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                  </button>
                </th>
                <th className="px-5 py-3 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Đang tải...</td></tr>
              )}
              {!loading && users.map(u => (
                <tr
                  key={u.id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => openDetail(u)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {u.full_name?.[0] ?? '?'}
                      </div>
                      <span className="font-medium text-gray-800">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono">{u.phone}</td>
                  <td className="px-5 py-3 font-semibold text-gray-800">{fmtVND(u.wallet_balance)}</td>
                  <td className="px-5 py-3 text-gray-600">{u.vehicle_count ?? 0} xe</td>
                  <td className="px-5 py-3 text-gray-600">{fmtDate(u.created_at)}</td>
                  <td className="px-5 py-3"><StatusBadge active={u.is_active} /></td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Không tìm thấy kết quả</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {}
            <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {detail.full_name?.[0] ?? '?'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 text-base">{detail.full_name}</h3>
                <p className="text-sm text-gray-500 font-mono">{detail.phone_number}</p>
              </div>
              <StatusBadge active={detail.is_active} />
              {!editing && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  <Edit2 size={14} /> Sửa
                </button>
              )}
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {}
            <div className="flex gap-1 px-6 pt-4 border-b border-gray-100">
              {[
                ['info',         <User size={14}/>,      'Thông tin'],
                ['vehicles',     <Car size={14}/>,       `Phương tiện (${detail.vehicles?.length ?? 0})`],
                ['sessions',     <Clock size={14}/>,     'Lịch sử gửi xe'],
                ['transactions', <Wallet size={14}/>,    'Giao dịch'],
                ['faces',        <ScanFace size={14}/>,  'Khuôn mặt'],
              ].map(([v, icon, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setDetailTab(v)
                    setEditing(false)
                    if (v === 'faces' && faceImages.length === 0) {
                      loadFaceImages(detail.id || detail.user_id)
                    }
                  }}
                  className={clsx(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                    detailTab === v
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {}
              {detailTab === 'info' && !editing && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Họ tên"        value={detail.full_name} />
                    <InfoRow label="Số điện thoại" value={<span className="font-mono">{detail.phone_number}</span>} />
                    <InfoRow label="Số dư ví"       value={<span className="font-bold text-emerald-700">{fmtVND(detail.wallet_balance)}</span>} />
                    <InfoRow label="Ngày đăng ký"  value={fmtDate(detail.created_at)} />
                    <InfoRow label="Trạng thái"    value={<StatusBadge active={detail.is_active} />} />
                    <InfoRow label="Xe đăng ký"    value={`${detail.vehicles?.length ?? 0} xe`} />
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => toggleActive(detail.id || detail.user_id)}
                      className={clsx(
                        'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                        detail.is_active
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                      )}
                    >
                      {detail.is_active ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
                    </button>
                  </div>
                </div>
              )}

              {}
              {detailTab === 'info' && editing && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Họ và tên</label>
                    <input
                      value={editForm.full_name}
                      onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Số điện thoại</label>
                    <input
                      value={editForm.phone_number}
                      onChange={e => setEditForm(f => ({ ...f, phone_number: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
                    <select
                      value={editForm.is_active ? 'true' : 'false'}
                      onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="true">Hoạt động</option>
                      <option value="false">Vô hiệu hóa</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Save size={14} />{saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {}
              {detailTab === 'vehicles' && (
                <div className="space-y-2">
                  {(detail.vehicles ?? []).map(v => (
                    <div key={v.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-4">
                        <Car size={18} className="text-blue-500 shrink-0" />
                        <div className="flex-1">
                          <div className="font-mono font-bold text-gray-800">{v.license_plate}</div>
                          <div className="text-xs text-gray-500">{v.nickname || '—'}</div>
                        </div>
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          v.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                        )}>
                          {v.is_active ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </div>
                      {v.plate_image_path ? (
                        <div
                          className="rounded-lg overflow-hidden bg-gray-200 cursor-pointer"
                          style={{ height: 72 }}
                          onClick={() => setPreviewImg(`/uploads/${v.plate_image_path}`)}
                        >
                          <img
                            src={`/uploads/${v.plate_image_path}`}
                            alt="biển số"
                            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Chưa có ảnh biển số</p>
                      )}
                    </div>
                  ))}
                  {(detail.vehicles ?? []).length === 0 && (
                    <p className="text-center text-gray-400 py-6">Chưa có phương tiện đăng ký</p>
                  )}
                </div>
              )}

              {}
              {detailTab === 'sessions' && (
                <div className="space-y-1">
                  {(detail.sessions ?? []).map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-sm py-2.5 border-b border-gray-100">
                      <span className="font-mono text-gray-700 font-semibold w-28 shrink-0">{s.license_plate}</span>
                      <span className="text-gray-500 flex-1 text-xs">
                        {fmtTime(s.entry_time)} → {s.exit_time ? fmtTime(s.exit_time) : 'Đang gửi'}
                      </span>
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                        s.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        {s.status === 'active' ? 'Đang gửi' : 'Đã ra'}
                      </span>
                      {s.fee_charged != null && (
                        <span className="font-semibold text-gray-800 shrink-0">{fmtVND(s.fee_charged)}</span>
                      )}
                    </div>
                  ))}
                  {(detail.sessions ?? []).length === 0 && (
                    <p className="text-center text-gray-400 py-6">Chưa có lịch sử gửi xe</p>
                  )}
                </div>
              )}

              {}
              {detailTab === 'transactions' && (
                <div className="space-y-1">
                  {(detail.transactions ?? []).map(t => (
                    <div key={t.id} className="flex items-center gap-3 text-sm py-2.5 border-b border-gray-100">
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                        t.transaction_type === 'topup'  ? 'bg-emerald-100 text-emerald-700'
                        : t.transaction_type === 'deduct' ? 'bg-rose-100 text-rose-700'
                        : 'bg-gray-100 text-gray-600'
                      )}>
                        {t.transaction_type === 'topup' ? 'Nạp tiền'
                          : t.transaction_type === 'deduct' ? 'Trừ phí' : t.transaction_type}
                      </span>
                      <span className="text-gray-500 flex-1 text-xs">{t.description || '—'}</span>
                      <span className="text-gray-400 text-xs shrink-0">{fmtDate(t.created_at)}</span>
                      <span className={clsx(
                        'font-semibold shrink-0',
                        t.transaction_type === 'topup' ? 'text-emerald-700' : 'text-rose-700'
                      )}>
                        {t.transaction_type === 'topup' ? '+' : '-'}{fmtVND(t.amount)}
                      </span>
                    </div>
                  ))}
                  {(detail.transactions ?? []).length === 0 && (
                    <p className="text-center text-gray-400 py-6">Chưa có giao dịch</p>
                  )}
                </div>
              )}

              {}
              {detailTab === 'faces' && (
                <div>
                  {faceLoading ? (
                    <p className="text-center text-gray-400 py-8">Đang tải...</p>
                  ) : faceImages.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">Người dùng chưa đăng ký ảnh khuôn mặt</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 mb-3">{faceImages.length} ảnh – click ảnh để phóng to</p>
                      <div className="grid grid-cols-3 gap-3">
                        {faceImages.map(img => (
                          <div
                            key={img.image_id}
                            className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square cursor-pointer group"
                            onClick={() => setPreviewImg(`/uploads/${img.image_path}`)}
                          >
                            <img
                              src={`/uploads/${img.image_path}`}
                              alt="face"
                              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-black/40 px-1.5 py-1">
                              <span className={clsx(
                                'text-[10px] font-semibold',
                                img.status === 'processed'    ? 'text-green-300'
                                : img.status === 'failed'     ? 'text-red-300'
                                : img.status === 'processing' ? 'text-yellow-300'
                                : 'text-gray-300'
                              )}>
                                {img.status === 'processed'    ? '✓ Đã xử lý'
                                  : img.status === 'failed'    ? '✗ Lỗi'
                                  : img.status === 'processing'? '⟳ Đang xử lý'
                                  : '⏳ Chờ xử lý'}
                              </span>
                              <p className="text-[9px] text-gray-300">{fmtDate(img.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setDetail(null)}
                className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {previewImg && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setPreviewImg(null)}
          >
            <X size={28} />
          </button>
          <img
            src={previewImg}
            alt="face preview"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  )
}

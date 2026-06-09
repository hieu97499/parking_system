import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { adminsApi } from '../api/services'
import {
  UserCog, Plus, Trash2, KeyRound, Shield, ShieldCheck,
  Eye, EyeOff, X, Check, AlertCircle, Pencil,
} from 'lucide-react'
import clsx from 'clsx'

const ROLE_LABEL = { superadmin: 'Superadmin', admin: 'Admin' }

function Badge({ role }) {
  return role === 'superadmin'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700"><ShieldCheck size={11}/> Superadmin</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"><Shield size={11}/> Admin</span>
}

function StatusDot({ active }) {
  return active
    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>Hoạt động</span>
    : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block"/>Vô hiệu hóa</span>
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18}/>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function PwInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={placeholder || ''}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15}/> : <Eye size={15}/>}
        </button>
      </div>
    </div>
  )
}

export default function AdminAccounts() {
  const { currentAdmin } = useStore()
  const isSuperAdmin = currentAdmin?.role === 'superadmin'

  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [changePwTarget, setChangePwTarget] = useState(null) // admin object
  const [deleteTarget, setDeleteTarget] = useState(null)     // admin object

  // Create form
  const [createForm, setCreateForm] = useState({ username: '', password: '', full_name: '', email: '', role: 'admin' })
  const [createErr, setCreateErr] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Change password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwErr, setPwErr] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)

  // Delete confirm
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  const fetchAdmins = async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await adminsApi.getAll()
      setAdmins(data)
    } catch (e) {
      setErr(e.message || 'Không tải được danh sách tài khoản')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAdmins() }, [])

  // ── Create ──────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateErr('')
    if (createForm.password.length < 8) { setCreateErr('Mật khẩu phải có ít nhất 8 ký tự'); return }
    setCreateLoading(true)
    try {
      const newAdmin = await adminsApi.create(createForm)
      setAdmins(prev => [...prev, newAdmin])
      setShowCreate(false)
      setCreateForm({ username: '', password: '', full_name: '', email: '', role: 'admin' })
    } catch (e) {
      setCreateErr(e.message || 'Tạo tài khoản thất bại')
    } finally {
      setCreateLoading(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────
  const handleToggleActive = async (admin) => {
    try {
      const updated = await adminsApi.update(admin.id, { is_active: !admin.is_active })
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, ...updated } : a))
    } catch (e) {
      alert(e.message || 'Không thể cập nhật trạng thái')
    }
  }

  // ── Change password ──────────────────────────────────────
  const handleChangePw = async (e) => {
    e.preventDefault()
    setPwErr('')
    if (pwForm.new_password.length < 8) { setPwErr('Mật khẩu mới phải có ít nhất 8 ký tự'); return }
    if (pwForm.new_password !== pwForm.confirm) { setPwErr('Mật khẩu xác nhận không khớp'); return }
    setPwLoading(true)
    try {
      await adminsApi.changePassword(changePwTarget.id, {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      })
      setPwSuccess(true)
      setTimeout(() => {
        setChangePwTarget(null)
        setPwSuccess(false)
        setPwForm({ current_password: '', new_password: '', confirm: '' })
      }, 1500)
    } catch (e) {
      setPwErr(e.message || 'Đổi mật khẩu thất bại')
    } finally {
      setPwLoading(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteErr('')
    setDeleteLoading(true)
    try {
      await adminsApi.remove(deleteTarget.id)
      setAdmins(prev => prev.filter(a => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      setDeleteErr(e.message || 'Xóa tài khoản thất bại')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><UserCog size={22}/> Quản lý tài khoản Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Danh sách tài khoản có quyền truy cập hệ thống quản trị</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={16}/> Thêm tài khoản
          </button>
        )}
      </div>

      {/* Info banner for non-superadmin */}
      {!isSuperAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          <Shield size={16}/>
          Bạn đang đăng nhập với quyền <strong>Admin</strong>. Chỉ có thể xem danh sách và đổi mật khẩu của chính mình.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Đang tải...</div>
        ) : err ? (
          <div className="py-16 text-center text-sm text-rose-500">{err}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-medium">Tài khoản</th>
                <th className="text-left px-4 py-3 font-medium">Họ tên</th>
                <th className="text-left px-4 py-3 font-medium">Vai trò</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map(admin => {
                const isSelf = String(admin.id) === String(currentAdmin?.id)
                return (
                  <tr key={admin.id} className={clsx('hover:bg-gray-50 transition-colors', isSelf && 'bg-blue-50/40')}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white',
                          admin.role === 'superadmin' ? 'bg-purple-500' : 'bg-blue-500')}>
                          {admin.full_name?.[0] ?? 'A'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">{admin.username}</div>
                          {isSelf && <div className="text-xs text-blue-600">Tài khoản của bạn</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">{admin.full_name}</td>
                    <td className="px-4 py-3.5"><Badge role={admin.role}/></td>
                    <td className="px-4 py-3.5"><StatusDot active={admin.is_active}/></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Đổi mật khẩu: chính mình hoặc superadmin */}
                        {(isSelf || isSuperAdmin) && (
                          <button
                            onClick={() => {
                              setChangePwTarget(admin)
                              setPwForm({ current_password: '', new_password: '', confirm: '' })
                              setPwErr('')
                              setPwSuccess(false)
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Đổi mật khẩu"
                          >
                            <KeyRound size={15}/>
                          </button>
                        )}
                        {/* Vô hiệu hóa / kích hoạt: chỉ superadmin, không với chính mình */}
                        {isSuperAdmin && !isSelf && (
                          <button
                            onClick={() => handleToggleActive(admin)}
                            className={clsx('p-1.5 rounded-lg transition-colors',
                              admin.is_active
                                ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50')}
                            title={admin.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          >
                            {admin.is_active ? <X size={15}/> : <Check size={15}/>}
                          </button>
                        )}
                        {/* Xóa: chỉ superadmin, không với chính mình */}
                        {isSuperAdmin && !isSelf && (
                          <button
                            onClick={() => { setDeleteTarget(admin); setDeleteErr('') }}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa tài khoản"
                          >
                            <Trash2 size={15}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Tạo tài khoản ── */}
      {showCreate && (
        <Modal title="Thêm tài khoản Admin mới" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Tên đăng nhập <span className="text-rose-500">*</span></label>
                <input required value={createForm.username}
                  onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="vd: admin2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Họ và tên <span className="text-rose-500">*</span></label>
                <input required value={createForm.full_name}
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nguyễn Văn A"
                />
              </div>
            </div>
            <PwInput label={<>Mật khẩu <span className="text-rose-500">*</span></>}
              value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Tối thiểu 8 ký tự"
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email (tùy chọn)</label>
              <input type="email" value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Vai trò</label>
              <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="admin">Admin (chỉ xem)</option>
                <option value="superadmin">Superadmin (toàn quyền)</option>
              </select>
            </div>
            {createErr && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                <AlertCircle size={14}/>{createErr}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={createLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {createLoading ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Hủy
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: Đổi mật khẩu ── */}
      {changePwTarget && (
        <Modal title={`Đổi mật khẩu — ${changePwTarget.username}`} onClose={() => setChangePwTarget(null)}>
          {pwSuccess ? (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Check size={28} className="text-emerald-600"/>
              </div>
              <p className="text-sm font-medium text-gray-700">Đổi mật khẩu thành công!</p>
            </div>
          ) : (
            <form onSubmit={handleChangePw} className="space-y-4">
              {/* Chỉ hiện "mật khẩu hiện tại" nếu đổi của chính mình */}
              {String(changePwTarget.id) === String(currentAdmin?.id) && (
                <PwInput label="Mật khẩu hiện tại"
                  value={pwForm.current_password}
                  onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))}
                />
              )}
              <PwInput label="Mật khẩu mới (tối thiểu 8 ký tự)"
                value={pwForm.new_password}
                onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
                placeholder="••••••••"
              />
              <PwInput label="Xác nhận mật khẩu mới"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="••••••••"
              />
              {pwErr && (
                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                  <AlertCircle size={14}/>{pwErr}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={pwLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                  {pwLoading ? 'Đang lưu...' : 'Đổi mật khẩu'}
                </button>
                <button type="button" onClick={() => setChangePwTarget(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Hủy
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Modal: Xác nhận xóa ── */}
      {deleteTarget && (
        <Modal title="Xác nhận xóa tài khoản" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-700">
              <p className="font-semibold mb-1">Bạn sắp xóa tài khoản:</p>
              <p><strong>{deleteTarget.full_name}</strong> ({deleteTarget.username}) — <Badge role={deleteTarget.role}/></p>
              <p className="mt-2">Thao tác này không thể hoàn tác. Tài khoản sẽ bị xóa vĩnh viễn.</p>
            </div>
            {deleteErr && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                <AlertCircle size={14}/>{deleteErr}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {deleteLoading ? 'Đang xóa...' : 'Xóa tài khoản'}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Hủy
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

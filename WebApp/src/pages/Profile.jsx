import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { authApi, faceImagesApi } from '../api/services';
import { User, Phone, Lock, LogOut, ChevronRight, Eye, EyeOff, Camera, Trash2, ScanFace, X } from 'lucide-react';

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, logout, fetchMe } = useStore();

  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(currentUser?.full_name || '');
  const [changePw, setChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [faceImages, setFaceImages]       = useState([]);
  const [faceLoading, setFaceLoading]     = useState(false);
  const [faceError, setFaceError]         = useState('');
  const [faceUploading, setFaceUploading] = useState(false);
  const [showFace, setShowFace]           = useState(false);
  const [previewImg, setPreviewImg]       = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!showFace) return;
    loadFaceImages();
  }, [showFace]);

  async function loadFaceImages() {
    setFaceLoading(true);
    setFaceError('');
    try {
      const data = await faceImagesApi.list();
      setFaceImages(Array.isArray(data) ? data : []);
    } catch (err) {
      setFaceError(err.message);
    } finally {
      setFaceLoading(false);
    }
  }

  async function handleFaceUpload(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFaceError('Chỉ chấp nhận file ảnh (JPEG, PNG, WEBP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFaceError('Ảnh quá lớn. Tối đa 5MB');
      return;
    }

    setFaceError('');
    setFaceUploading(true);
    try {
      const imageData = await readFileAsBase64(file);
      const newImg = await faceImagesApi.upload(imageData);
      setFaceImages(prev => [newImg, ...prev]);
      setMessage('Tải ảnh khuôn mặt thành công. Đang chờ hệ thống AI xử lý...');
    } catch (err) {
      setFaceError(err.message);
    } finally {
      setFaceUploading(false);
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không thể đọc file'));
      reader.readAsDataURL(file);
    });
  }

  async function handleDeleteFaceImage(imageId) {
    if (!confirm('Xóa ảnh khuôn mặt này?')) return;
    try {
      await faceImagesApi.remove(imageId);
      setFaceImages(prev => prev.filter(img => img.image_id !== imageId));
    } catch (err) {
      setFaceError(err.message);
    }
  }

  async function handleSaveName(e) {
    e.preventDefault();
    setError(''); setMessage('');
    setLoading(true);
    try {
      await authApi.updateProfile({ full_name: newName.trim() });
      await fetchMe();
      setMessage('Cập nhật thành công');
      setEditName(false);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleChangePw(e) {
    e.preventDefault();
    setError(''); setMessage('');
    if (pwForm.new_password !== pwForm.confirm) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword({ old_password: pwForm.old_password, new_password: pwForm.new_password });
      setMessage('Đổi mật khẩu thành công');
      setChangePw(false);
      setPwForm({ old_password: '', new_password: '', confirm: '' });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleLogout() {
    if (!confirm('Đăng xuất khỏi tài khoản?')) return;
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="p-4 space-y-4">
      {}
      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-600 text-2xl font-bold">
            {currentUser?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>
        <div>
          <p className="font-bold text-slate-800 text-lg">{currentUser?.full_name}</p>
          <p className="text-sm text-slate-400">{currentUser?.phone_number}</p>
          {currentUser?.is_verified && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Đã xác thực SĐT
            </span>
          )}
        </div>
      </div>

      {}
      {message && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{message}</div>}
      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}

      {}
      <div className="card">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => { setEditName(v => !v); setError(''); setMessage(''); }}>
          <div className="flex items-center gap-2">
            <User size={18} className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Họ và tên</p>
              <p className="text-xs text-slate-400">{currentUser?.full_name}</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-slate-300 transition-transform ${editName ? 'rotate-90' : ''}`} />
        </div>

        {editName && (
          <form onSubmit={handleSaveName} className="mt-3 space-y-3">
            <input
              className="input-field"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nhập tên mới"
              required
            />
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="btn-primary py-2">Lưu</button>
              <button type="button" onClick={() => setEditName(false)} className="btn-secondary py-2">Hủy</button>
            </div>
          </form>
        )}
      </div>

      {}
      <div className="card flex items-center gap-2">
        <Phone size={18} className="text-slate-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-slate-700">Số điện thoại</p>
          <p className="text-xs text-slate-400">{currentUser?.phone_number}</p>
        </div>
      </div>

      {}
      <div className="card">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => { setChangePw(v => !v); setError(''); setMessage(''); }}>
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Đổi mật khẩu</p>
          </div>
          <ChevronRight size={16} className={`text-slate-300 transition-transform ${changePw ? 'rotate-90' : ''}`} />
        </div>

        {changePw && (
          <form onSubmit={handleChangePw} className="mt-3 space-y-3">
            {(['old_password', 'new_password', 'confirm']).map((field, i) => (
              <div key={field} className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field pr-10"
                  placeholder={['Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới'][i]}
                  value={pwForm[field]}
                  onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                  required
                  minLength={field !== 'old_password' ? 6 : undefined}
                />
                {i === 0 && (
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="btn-primary py-2">
                {loading ? 'Đang lưu...' : 'Xác nhận'}
              </button>
              <button type="button" onClick={() => setChangePw(false)} className="btn-secondary py-2">Hủy</button>
            </div>
          </form>
        )}
      </div>

      {}
      <div className="card">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => { setShowFace(v => !v); setFaceError(''); }}
        >
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Ảnh khuôn mặt</p>
              <p className="text-xs text-slate-400">Dùng để nhận diện khi lấy xe</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {faceImages.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {faceImages.length}/5
              </span>
            )}
            <ChevronRight size={16} className={`text-slate-300 transition-transform ${showFace ? 'rotate-90' : ''}`} />
          </div>
        </div>

        {showFace && (
          <div className="mt-4 space-y-3">
            {faceError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{faceError}</div>
            )}

            {}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFaceUpload}
            />

            {}
            {faceImages.length < 5 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={faceUploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 text-sm font-medium hover:bg-blue-50 disabled:opacity-60 transition-colors"
              >
                <Camera size={16} />
                {faceUploading ? 'Đang tải lên...' : 'Thêm ảnh khuôn mặt'}
              </button>
            )}

            {}
            {faceLoading ? (
              <p className="text-center text-slate-400 text-sm py-4">Đang tải...</p>
            ) : faceImages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">Chưa có ảnh khuôn mặt</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {faceImages.map(img => (
                  <div key={img.image_id} className="relative group rounded-xl overflow-hidden bg-slate-100 aspect-square">
                    <img
                      src={`/uploads/${img.image_path}`}
                      alt="face"
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewImg(`/uploads/${img.image_path}`)}
                    />
                    {}
                    <span className={`absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      img.status === 'processed'   ? 'bg-green-500 text-white'
                      : img.status === 'failed'    ? 'bg-red-500 text-white'
                      : img.status === 'processing'? 'bg-yellow-400 text-white'
                      : 'bg-slate-500 text-white'
                    }`}>
                      {img.status === 'processed'    ? 'Đã xử lý'
                        : img.status === 'failed'    ? 'Lỗi'
                        : img.status === 'processing'? 'Đang xử lý'
                        : 'Chờ xử lý'}
                    </span>
                    {}
                    <button
                      onClick={() => handleDeleteFaceImage(img.image_id)}
                      className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center">
              Tối đa 5 ảnh · Ảnh sẽ được AI xử lý để nhận diện khuôn mặt
            </p>
          </div>
        )}
      </div>

      {}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-600 border border-red-200 hover:bg-red-50 font-medium transition-colors"
      >
        <LogOut size={18} /> Đăng xuất
      </button>

      <p className="text-center text-xs text-slate-300 pb-2">ParkSmart v1.0 – Bãi đỗ xe thông minh</p>

      {}
      {previewImg && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setPreviewImg(null)}>
            <X size={28} />
          </button>
          <img src={previewImg} alt="preview" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

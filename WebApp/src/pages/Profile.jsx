import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { authApi, faceImagesApi } from '../api/services';
import { User, Phone, Lock, LogOut, ChevronRight, Eye, EyeOff, Camera, Trash2, ScanFace, X, Check, AlertCircle, Upload } from 'lucide-react';

const FACE_ANGLES = [
  { key: 'front', label: 'Chính diện',   guide: 'Nhìn thẳng vào camera' },
  { key: 'left',  label: 'Nghiêng trái', guide: 'Xoay mặt sang trái ~30°' },
  { key: 'right', label: 'Nghiêng phải', guide: 'Xoay mặt sang phải ~30°' },
  { key: 'up',    label: 'Ngước lên',    guide: 'Ngước đầu nhẹ lên trên' },
  { key: 'down',  label: 'Cúi xuống',    guide: 'Cúi đầu nhẹ xuống dưới' },
];

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

  const [faceImages, setFaceImages]       = useState({});  // { front: {...}, left: {...}, ... }
  const [angleStatus, setAngleStatus]     = useState({});
  const [faceLoading, setFaceLoading]     = useState(false);
  const [faceError, setFaceError]         = useState('');
  const [uploadingAngle, setUploadingAngle] = useState(null);
  const [showFace, setShowFace]           = useState(false);
  const [previewImg, setPreviewImg]       = useState(null);
  const [activeAngle, setActiveAngle]     = useState('front');
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
      // data = { images: [...], angle_status: { front: {...}, ... } }
      const byAngle = {};
      if (data?.images) {
        data.images.forEach(img => { if (img.angle) byAngle[img.angle] = img; });
      }
      setFaceImages(byAngle);
      setAngleStatus(data?.angle_status || {});
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
    setUploadingAngle(activeAngle);
    try {
      const imageData = await readFileAsBase64(file);
      const newImg = await faceImagesApi.upload(imageData, activeAngle);
      setFaceImages(prev => ({ ...prev, [activeAngle]: newImg }));
      setMessage(`Tải ảnh góc "${FACE_ANGLES.find(a=>a.key===activeAngle)?.label}" thành công!`);
      // Tự chuyển sang góc tiếp theo chưa có ảnh
      const nextMissing = FACE_ANGLES.find(a => a.key !== activeAngle && !faceImages[a.key]);
      if (nextMissing) setActiveAngle(nextMissing.key);
    } catch (err) {
      setFaceError(err.message);
    } finally {
      setUploadingAngle(null);
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

  async function handleDeleteFaceImage(angle, imageId) {
    if (!confirm(`Xóa ảnh góc "${FACE_ANGLES.find(a=>a.key===angle)?.label}"?`)) return;
    try {
      await faceImagesApi.remove(imageId);
      setFaceImages(prev => { const n = {...prev}; delete n[angle]; return n; });
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

      {/* Ảnh khuôn mặt – 5 góc */}
      <div className="card">
        <div className="flex items-center justify-between cursor-pointer"
          onClick={() => { setShowFace(v => !v); setFaceError(''); if (!showFace) loadFaceImages(); }}>
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Ảnh khuôn mặt (5 góc)</p>
              <p className="text-xs text-slate-400">Dùng để nhận diện khi vào/ra bãi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const done = Object.keys(faceImages).length;
              return done > 0 ? (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  done >= 5 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
                }`}>{done}/5 góc</span>
              ) : null;
            })()}
            <ChevronRight size={16} className={`text-slate-300 transition-transform ${showFace ? 'rotate-90' : ''}`} />
          </div>
        </div>

        {showFace && (
          <div className="mt-4 space-y-3">
            {faceError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />{faceError}
              </div>
            )}

            {/* Progress tổng quát */}
            {!faceLoading && (() => {
              const done = Object.keys(faceImages).length;
              return (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Tiến độ đăng ký</span>
                    <span className={done >= 5 ? 'text-green-600 font-semibold' : 'text-orange-600'}>{done}/5 góc</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      done >= 5 ? 'bg-green-500' : 'bg-blue-500'
                    }`} style={{ width: `${(done / 5) * 100}%` }} />
                  </div>
                  {done >= 5 && (
                    <p className="text-xs text-green-600 font-medium mt-1 flex items-center gap-1">
                      <Check size={12} /> Đã đăng ký đầy đủ – AI có thể nhận diện bạn ở mọi góc
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Input file ẩn */}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={handleFaceUpload} />

            {/* Grid 5 góc */}
            {faceLoading ? (
              <p className="text-center text-slate-400 text-sm py-4">Đang tải...</p>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {FACE_ANGLES.map(angle => {
                  const img = faceImages[angle.key];
                  const isUploading = uploadingAngle === angle.key;
                  return (
                    <div key={angle.key} className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => { setActiveAngle(angle.key); fileInputRef.current?.click(); }}
                        title={angle.guide}
                        className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                          isUploading ? 'border-blue-400 opacity-70'
                          : img ? 'border-green-400 hover:border-green-500'
                          : 'border-slate-200 hover:border-blue-400 border-dashed'
                        }`}>
                        {isUploading ? (
                          <div className="w-full h-full bg-blue-50 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : img ? (
                          <>
                            <img src={`/uploads/${img.image_path}`} alt={angle.label}
                              className="w-full h-full object-cover"
                              onClick={e => { e.stopPropagation(); setPreviewImg(`/uploads/${img.image_path}`); }} />
                            <span className={`absolute bottom-0 inset-x-0 text-[9px] text-center py-0.5 font-medium ${
                              img.status === 'processed' ? 'bg-green-500/80 text-white'
                              : img.status === 'failed'  ? 'bg-red-500/80 text-white'
                              : 'bg-black/50 text-white'
                            }`}>
                              {img.status === 'processed' ? '✓ OK' : img.status === 'failed' ? '✗ Lỗi' : '⏳'}
                            </span>
                          </>
                        ) : (
                          <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                            <Camera size={16} className="text-slate-300" />
                          </div>
                        )}
                      </button>

                      {img ? (
                        <button onClick={() => handleDeleteFaceImage(angle.key, img.image_id)}
                          className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      ) : <div className="h-4" />}

                      <p className="text-[10px] text-slate-500 text-center leading-tight">{angle.label}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center">
              Nhấn vào từng ô để upload ảnh theo góc · AI xử lý sau khi tải lên
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

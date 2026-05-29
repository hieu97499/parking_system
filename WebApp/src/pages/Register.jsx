import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { authApi } from '../api/services';
import {
  User, Phone, Lock, Eye, EyeOff, Camera, Car,
  ChevronRight, ChevronLeft, Check, RotateCcw, Upload
} from 'lucide-react';

// ── Cấu hình 5 góc mặt ──────────────────────────────────────────────────────
const FACE_ANGLES = [
  {
    key: 'front',
    label: 'Chính diện',
    hint: 'Nhìn thẳng vào camera',
    emoji: '😐',
    icon: '⬆️',
    guide: 'Giữ đầu thẳng, nhìn thẳng vào camera',
  },
  {
    key: 'left',
    label: 'Nghiêng trái',
    hint: 'Xoay đầu nhẹ sang trái ~30°',
    emoji: '😶',
    icon: '⬅️',
    guide: 'Xoay mặt sang trái khoảng 30°',
  },
  {
    key: 'right',
    label: 'Nghiêng phải',
    hint: 'Xoay đầu nhẹ sang phải ~30°',
    emoji: '😶',
    icon: '➡️',
    guide: 'Xoay mặt sang phải khoảng 30°',
  },
  {
    key: 'up',
    label: 'Ngước lên',
    hint: 'Ngước đầu nhẹ lên trên',
    emoji: '🙂',
    icon: '⬆️',
    guide: 'Ngước đầu nhẹ lên, giữ mặt trong khung hình',
  },
  {
    key: 'down',
    label: 'Cúi xuống',
    hint: 'Cúi đầu nhẹ xuống dưới',
    emoji: '🙄',
    icon: '⬇️',
    guide: 'Cúi đầu nhẹ xuống, giữ mặt trong khung hình',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

// Nén ảnh về tối đa 800px, JPEG 0.75 để giảm kích thước gửi lên server
function compressImage(dataUrl, maxSize = 800, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
        else { width = Math.round(width * maxSize / height); height = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback nếu lỗi
    img.src = dataUrl;
  });
}

function StepIndicator({ step, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
            ${i < step  ? 'bg-green-500 text-white'
            : i === step ? 'bg-white text-blue-600 ring-2 ring-blue-300'
            : 'bg-white/30 text-white/60'}`}>
            {i < step ? <Check size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 mx-1 transition-all ${i < step ? 'bg-green-400' : 'bg-white/30'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Thông tin cơ bản ────────────────────────────────────────────────
function Step1({ form, setForm, onNext, loading, error }) {
  const [showPw, setShowPw] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return;
    onNext();
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Tạo tài khoản</h2>
      <p className="text-sm text-slate-400 mb-5">Bước 1/3 – Thông tin cơ bản</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Họ và tên</label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" className="input-field pl-9" placeholder="Nguyễn Văn A"
              value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Số điện thoại</label>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="tel" className="input-field pl-9" placeholder="0912 345 678"
              value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mật khẩu</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPw ? 'text' : 'password'} className="input-field pl-9 pr-10"
              placeholder="Tối thiểu 6 ký tự" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Xác nhận mật khẩu</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPw ? 'text' : 'password'} className="input-field pl-9"
              placeholder="Nhập lại mật khẩu" value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          {form.confirm && form.password !== form.confirm && (
            <p className="text-xs text-red-500 mt-1">Mật khẩu không khớp</p>
          )}
        </div>

        <button type="submit" disabled={form.confirm && form.password !== form.confirm}
          className="btn-primary mt-2 flex items-center justify-center gap-2">
          Tiếp theo <ChevronRight size={16} />
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-5">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-blue-600 font-semibold hover:underline">Đăng nhập</Link>
      </p>
    </div>
  );
}

// ── Step 2: Chụp ảnh 5 góc mặt ─────────────────────────────────────────────
function Step2({ faceImages, setFaceImages, onNext, onBack }) {
  const [activeAngle, setActiveAngle] = useState('front');
  const [capturing, setCapturing]     = useState(false);
  const [cameraMode, setCameraMode]   = useState(false);
  const [stream, setStream]           = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const fileRef   = useRef(null);
  const cameraInputRef = useRef(null); // fallback cho mobile HTTP (không có getUserMedia)

  const doneCount   = Object.keys(faceImages).length;
  const currentAngle = FACE_ANGLES.find(a => a.key === activeAngle);
  const allDone = FACE_ANGLES.every(a => faceImages[a.key]);

  // Mở camera
  async function startCamera() {
    setCameraError('');

    // Trên mobile qua HTTP, navigator.mediaDevices không khả dụng → dùng input capture
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      setStream(s);
      setCameraMode(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera bị từ chối quyền. Vui lòng cho phép camera trong cài đặt trình duyệt.');
      } else {
        // Fallback sang input capture (hoạt động trên cả HTTP)
        cameraInputRef.current?.click();
      }
    }
  }

  // Xử lý ảnh từ input capture (mobile fallback)
  async function handleCameraCapture(e) {
    const file = e.target.files?.[0];
    cameraInputRef.current.value = '';
    if (!file) return;
    setCapturing(true);
    try {
      const raw = await readFileAsBase64(file);
      const dataUrl = await compressImage(raw, 800, 0.80);
      setFaceImages(prev => ({ ...prev, [activeAngle]: dataUrl }));
      const idx = FACE_ANGLES.findIndex(a => a.key === activeAngle);
      if (idx < FACE_ANGLES.length - 1) setActiveAngle(FACE_ANGLES[idx + 1].key);
    } finally {
      setCapturing(false);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setCameraMode(false);
  }

  // Chụp từ camera
  async function captureFromCamera() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const raw = canvas.toDataURL('image/jpeg', 0.85);
    const dataUrl = await compressImage(raw, 800, 0.80);
    setFaceImages(prev => ({ ...prev, [activeAngle]: dataUrl }));
    const idx = FACE_ANGLES.findIndex(a => a.key === activeAngle);
    if (idx < FACE_ANGLES.length - 1) {
      setActiveAngle(FACE_ANGLES[idx + 1].key);
    }
  }

  // Upload từ file
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setCapturing(true);
    try {
      const raw = await readFileAsBase64(file);
      const dataUrl = await compressImage(raw, 800, 0.80);
      setFaceImages(prev => ({ ...prev, [activeAngle]: dataUrl }));
      const idx = FACE_ANGLES.findIndex(a => a.key === activeAngle);
      if (idx < FACE_ANGLES.length - 1) setActiveAngle(FACE_ANGLES[idx + 1].key);
    } finally {
      setCapturing(false);
    }
  }

  function handleNext() {
    stopCamera();
    onNext();
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Đăng ký khuôn mặt</h2>
      <p className="text-sm text-slate-400 mb-4">
        Bước 2/3 – Chụp <span className="font-semibold text-blue-600">5 góc mặt</span> để AI nhận diện chính xác hơn
      </p>

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-4">
        {FACE_ANGLES.map(a => (
          <button key={a.key} onClick={() => setActiveAngle(a.key)}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              faceImages[a.key] ? 'bg-green-500' : a.key === activeAngle ? 'bg-blue-500' : 'bg-slate-200'
            }`} />
        ))}
      </div>

      {/* Góc đang chụp */}
      <div className="grid grid-cols-5 gap-1.5 mb-4">
        {FACE_ANGLES.map(a => (
          <button key={a.key} onClick={() => setActiveAngle(a.key)}
            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
              a.key === activeAngle ? 'border-blue-500 scale-105 shadow-md'
              : faceImages[a.key] ? 'border-green-400' : 'border-slate-200'
            }`}>
            {faceImages[a.key] ? (
              <>
                <img src={faceImages[a.key]} alt={a.label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                  <Check size={14} className="text-green-600 drop-shadow" />
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center text-xs
                ${a.key === activeAngle ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                <span className="text-lg leading-none">{a.emoji}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Hướng dẫn góc hiện tại */}
      <div className="bg-blue-50 rounded-xl p-3 mb-4 text-center">
        <p className="font-semibold text-blue-800 text-sm">{currentAngle?.label}</p>
        <p className="text-xs text-blue-600 mt-0.5">{currentAngle?.guide}</p>
      </div>

      {/* Camera preview hoặc placeholder */}
      {cameraMode ? (
        <div className="relative mb-4">
          <video ref={videoRef} autoPlay playsInline muted
            className="w-full aspect-[4/3] rounded-xl object-cover bg-black" />
          <canvas ref={canvasRef} className="hidden" />
          {/* Overlay khung mặt */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-36 h-44 border-4 border-white/60 rounded-[40%] shadow-lg" />
          </div>
          {/* Nút chụp ảnh nổi trên preview */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <button onClick={captureFromCamera}
              className="w-14 h-14 rounded-full bg-white border-4 border-blue-500 shadow-xl
                flex items-center justify-center active:scale-90 transition-transform hover:bg-blue-50">
              <Camera size={24} className="text-blue-600" />
            </button>
          </div>
        </div>
      ) : faceImages[activeAngle] ? (
        <div className="relative mb-4">
          <img src={faceImages[activeAngle]} alt="preview"
            className="w-full aspect-[4/3] rounded-xl object-cover" />
          <button onClick={() => setFaceImages(prev => { const n={...prev}; delete n[activeAngle]; return n; })}
            className="absolute top-2 right-2 bg-white/80 backdrop-blur rounded-lg px-2 py-1 text-xs text-red-600 flex items-center gap-1">
            <RotateCcw size={12} /> Chụp lại
          </button>
        </div>
      ) : (
        <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 flex flex-col items-center justify-center mb-4 border-2 border-dashed border-slate-300">
          <Camera size={32} className="text-slate-300 mb-2" />
          <p className="text-xs text-slate-400">Chụp hoặc tải ảnh lên</p>
        </div>
      )}

      {cameraError && <p className="text-xs text-red-500 mb-3 text-center">{cameraError}</p>}

      {/* Nút chụp / upload */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={handleFileUpload} />
      {/* Fallback camera cho mobile HTTP (getUserMedia không khả dụng) */}
      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        capture="user" className="hidden" onChange={handleCameraCapture} />

      <div className="flex gap-2 mb-4">
        {cameraMode ? (
          <>
            <button onClick={captureFromCamera}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5">
              <Camera size={16} /> Chụp
            </button>
            <button onClick={stopCamera}
              className="px-4 bg-slate-100 text-slate-600 rounded-xl py-2.5 text-sm font-medium">
              Hủy
            </button>
          </>
        ) : (
          <>
            <button onClick={startCamera}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5">
              <Camera size={16} /> Mở camera
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={capturing}
              className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5">
              <Upload size={16} /> Tải lên
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mb-4">
        {doneCount}/5 góc đã chụp
        {allDone && <span className="text-green-600 font-semibold"> · Hoàn thành! ✓</span>}
      </p>

      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 btn-secondary flex items-center justify-center gap-1 py-2.5">
          <ChevronLeft size={16} /> Quay lại
        </button>
        <button onClick={handleNext} disabled={doneCount === 0}
          className="flex-1 btn-primary flex items-center justify-center gap-1 py-2.5 disabled:opacity-50">
          {allDone ? 'Tiếp theo' : `Bỏ qua (${doneCount}/5)`} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Thông tin xe ────────────────────────────────────────────────────
function Step3({ vehicle, setVehicle, onBack, onSubmit, loading, error }) {
  const [platePreview, setPlatePreview] = useState(null);
  const fileRef = useRef(null);

  async function handlePlateFile(e) {
    const file = e.target.files?.[0];
    fileRef.current.value = '';
    if (!file) return;
    const raw = await readFileAsBase64(file);
    const dataUrl = await compressImage(raw, 1000, 0.82); // biển số cần rõ hơn → 1000px
    setVehicle(v => ({ ...v, plate_image_data: dataUrl }));
    setPlatePreview(dataUrl);
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Đăng ký xe</h2>
      <p className="text-sm text-slate-400 mb-5">Bước 3/3 – Thêm xe để ra vào bãi</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Biển số xe <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Car size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" className="input-field pl-9 uppercase tracking-widest font-mono"
              placeholder="51A-12345" value={vehicle.license_plate}
              onChange={e => setVehicle(v => ({ ...v, license_plate: e.target.value.toUpperCase() }))} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Tên xe (tùy chọn)</label>
          <input type="text" className="input-field" placeholder="VD: Xe đi làm"
            value={vehicle.nickname}
            onChange={e => setVehicle(v => ({ ...v, nickname: e.target.value }))} />
        </div>

        {/* Ảnh biển số */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Ảnh biển số <span className="text-xs text-slate-400">(tùy chọn – giúp AI nhận diện tốt hơn)</span>
          </label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={handlePlateFile} />

          {platePreview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <img src={platePreview} alt="plate" className="w-full h-32 object-cover" />
              <button onClick={() => { setVehicle(v => ({ ...v, plate_image_data: null })); setPlatePreview(null); }}
                className="absolute top-2 right-2 bg-white/80 backdrop-blur rounded-lg px-2 py-1 text-xs text-red-600 flex items-center gap-1">
                <RotateCcw size={12} /> Đổi ảnh
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Upload size={16} /> Tải ảnh biển số lên
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onBack} className="flex-1 btn-secondary flex items-center justify-center gap-1 py-2.5">
            <ChevronLeft size={16} /> Quay lại
          </button>
          <button onClick={onSubmit} disabled={loading}
            className="flex-1 btn-primary flex items-center justify-center gap-1 py-2.5">
            {loading ? 'Đang tạo...' : <><Check size={16} /> Hoàn tất</>}
          </button>
        </div>

        <button onClick={onSubmit} disabled={loading || !!vehicle.license_plate}
          className="w-full text-center text-sm text-slate-400 hover:text-slate-600 py-1">
          Bỏ qua, thêm xe sau
        </button>
      </div>
    </div>
  );
}

// ── Main Register Component ──────────────────────────────────────────────────
export default function Register() {
  const navigate  = useNavigate();
  const registerFn = useStore(s => s.register);

  const [step, setStep]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [form, setForm] = useState({ full_name: '', phone_number: '', password: '', confirm: '' });
  const [faceImages, setFaceImages] = useState({});   // { front: 'data:...', left: '...', ... }
  const [vehicle, setVehicle]       = useState({ license_plate: '', nickname: '', plate_image_data: null });

  // Step 1 → 2: Chỉ validate cục bộ, chưa gọi API
  function handleValidateStep1() {
    setError('');
    setStep(1);
  }

  // Step 3: Tạo tài khoản + setup (ảnh mặt + xe) trong một lần
  async function handleSetup() {
    setError('');
    setLoading(true);
    try {
      // 1. Tạo tài khoản (hoặc đăng nhập lại nếu đã tạo ở lần thử trước)
      try {
        const data = await registerFn({
          full_name:    form.full_name.trim(),
          phone_number: form.phone_number.trim(),
          password:     form.password,
        });
        if (data?.token) {
          localStorage.setItem('user_token', data.token);
          if (data.user) localStorage.setItem('user_info', JSON.stringify(data.user));
        }
      } catch (regErr) {
        // Nếu số điện thoại đã tồn tại (do lần thử trước thành công nhưng setup bị lỗi),
        // thử đăng nhập lại với thông tin đã nhập để tiếp tục setup
        const msg = regErr?.message || '';
        if (msg.includes('đã được đăng ký') || msg.includes('already') || msg.includes('409')) {
          try {
            const loginData = await authApi.login(
              form.phone_number.replace(/[\s\-\.]/g, '').trim(),
              form.password,
            );
            if (loginData?.token) {
              localStorage.setItem('user_token', loginData.token);
              if (loginData.user) localStorage.setItem('user_info', JSON.stringify(loginData.user));
            }
          } catch {
            // Đăng nhập thất bại → mật khẩu sai hoặc lỗi khác
            throw new Error('Số điện thoại đã được đăng ký với mật khẩu khác. Vui lòng đăng nhập.');
          }
        } else {
          throw regErr;
        }
      }

      // 2. Setup ảnh mặt + xe
      await authApi.setup({
        face_images:      Object.keys(faceImages).length > 0 ? faceImages : undefined,
        license_plate:    vehicle.license_plate || undefined,
        plate_image_data: vehicle.plate_image_data || undefined,
        vehicle_nickname: vehicle.nickname || undefined,
      });
      navigate('/dashboard', { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col items-center justify-center px-4 py-10">
      {/* Logo */}
      <div className="mb-6 text-center">
        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg">
          <span className="text-blue-600 text-2xl font-bold">P</span>
        </div>
        <h1 className="text-white text-xl font-bold">ParkSmart</h1>
      </div>

      <StepIndicator step={step} total={3} />

      {step === 0 && (
        <Step1
          form={form} setForm={setForm}
          onNext={handleValidateStep1}
          loading={loading} error={error}
        />
      )}
      {step === 1 && (
        <Step2
          faceImages={faceImages} setFaceImages={setFaceImages}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <Step3
          vehicle={vehicle} setVehicle={setVehicle}
          onBack={() => setStep(1)}
          onSubmit={handleSetup}
          loading={loading} error={error}
        />
      )}
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { vehiclesApi } from '../api/services';
import { Car, Plus, Pencil, Trash2, X, Check, Camera, ImageIcon } from 'lucide-react';

export default function Vehicles() {
  const { vehicles, fetchVehicles, addVehicle, updateVehicle, removeVehicle } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ license_plate: '', nickname: '' });
  const [editNickname, setEditNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [plateUploading, setPlateUploading] = useState(null);
  const [plateError, setPlateError]         = useState('');
  const [previewImg, setPreviewImg]         = useState(null);
  const fileInputRef = useRef(null);
  const uploadingForId = useRef(null);

  useEffect(() => { fetchVehicles(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await addVehicle(form);
      setForm({ license_plate: '', nickname: '' });
      setShowAdd(false);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleUpdate(id) {
    setLoading(true);
    try {
      await updateVehicle(id, { nickname: editNickname });
      setEditId(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleRemove(id, plate) {
    if (!confirm(`Xóa xe ${plate} khỏi danh sách?`)) return;
    try { await removeVehicle(id); }
    catch (err) { alert(err.message); }
  }

  function triggerPlateUpload(vehicleId) {
    uploadingForId.current = vehicleId;
    fileInputRef.current?.click();
  }

  async function handlePlateFileChange(e) {
    const file = e.target.files?.[0];
    fileInputRef.current.value = '';
    if (!file) return;

    const vehicleId = uploadingForId.current;
    if (!vehicleId) return;

    setPlateError('');
    if (!file.type.startsWith('image/')) { setPlateError('Chỉ chấp nhận file ảnh (JPEG, PNG, WEBP)'); return; }
    if (file.size > 5 * 1024 * 1024)    { setPlateError('Ảnh quá lớn. Tối đa 5MB'); return; }

    setPlateUploading(vehicleId);
    try {
      const imageData = await readFileAsBase64(file);
      await vehiclesApi.uploadPlateImage(vehicleId, imageData);
      await fetchVehicles();
    } catch (err) {
      setPlateError(err.message);
    } finally {
      setPlateUploading(null);
    }
  }

  async function handleRemovePlateImage(vehicleId) {
    if (!confirm('Xóa ảnh biển số này?')) return;
    setPlateError('');
    try {
      await vehiclesApi.removePlateImage(vehicleId);
      await fetchVehicles();
    } catch (err) {
      setPlateError(err.message);
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

  const activeVehicles = vehicles.filter(v => v.is_active);

  return (
    <div className="p-4 space-y-4">
      {}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePlateFileChange}
      />

      {}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{activeVehicles.length} xe đã đăng ký</p>
        <button
          onClick={() => { setShowAdd(v => !v); setError(''); }}
          className="flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-blue-700"
        >
          <Plus size={16} /> Thêm xe
        </button>
      </div>

      {}
      {plateError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center justify-between">
          {plateError}
          <button onClick={() => setPlateError('')}><X size={14} /></button>
        </div>
      )}

      {}
      {showAdd && (
        <form onSubmit={handleAdd} className="card space-y-3 border-blue-200 border-2">
          <h3 className="font-semibold text-slate-800">Thêm xe mới</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Biển số xe *</label>
            <input
              className="input-field uppercase"
              placeholder="Ví dụ: 51F-12345"
              value={form.license_plate}
              onChange={e => setForm(f => ({ ...f, license_plate: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên gợi nhớ</label>
            <input
              className="input-field"
              placeholder="Ví dụ: Xe đi làm"
              value={form.nickname}
              onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary py-2">
              {loading ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary py-2">
              Hủy
            </button>
          </div>
        </form>
      )}

      {}
      {activeVehicles.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Car size={40} className="mx-auto mb-3 opacity-30" />
          <p>Bạn chưa đăng ký xe nào</p>
          <p className="text-sm mt-1">Nhấn "Thêm xe" để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeVehicles.map(v => (
            <div key={v.id} className="card space-y-3">
              {}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Car size={20} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800">{v.license_plate}</p>
                  {editId === v.id ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        className="input-field py-1 text-sm"
                        value={editNickname}
                        onChange={e => setEditNickname(e.target.value)}
                        placeholder="Tên gợi nhớ"
                        autoFocus
                      />
                      <button onClick={() => handleUpdate(v.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">{v.nickname || 'Chưa đặt tên'}</p>
                  )}
                </div>
                {editId !== v.id && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditId(v.id); setEditNickname(v.nickname || ''); }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleRemove(v.id, v.license_plate)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                  <ImageIcon size={12} /> Ảnh biển số xe
                </p>
                {v.plate_image_path ? (
                  <div className="flex items-start gap-2">
                    <div
                      className="relative rounded-xl overflow-hidden bg-slate-100 cursor-pointer"
                      style={{ width: 140, height: 70 }}
                      onClick={() => setPreviewImg(`/uploads/${v.plate_image_path}`)}
                    >
                      <img
                        src={`/uploads/${v.plate_image_path}`}
                        alt="biển số"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => triggerPlateUpload(v.id)}
                        disabled={plateUploading === v.id}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg border border-blue-200"
                      >
                        <Camera size={12} />
                        {plateUploading === v.id ? 'Đang tải...' : 'Đổi ảnh'}
                      </button>
                      <button
                        onClick={() => handleRemovePlateImage(v.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg border border-red-200"
                      >
                        <Trash2 size={12} /> Xóa ảnh
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => triggerPlateUpload(v.id)}
                    disabled={plateUploading === v.id}
                    className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 text-sm hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-60 transition-colors"
                  >
                    <Camera size={15} />
                    {plateUploading === v.id ? 'Đang tải lên...' : 'Thêm ảnh biển số'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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

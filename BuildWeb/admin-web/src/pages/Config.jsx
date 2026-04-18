import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Pencil, X, Save, DollarSign, Building2 } from 'lucide-react'
import clsx from 'clsx'

const fmtVND = n => Number(n).toLocaleString('vi-VN') + 'đ'

export default function Config() {
  const { pricing, updatePricing, lot } = useStore()
  const [tab, setTab] = useState('pricing')
  const [editPricing, setEditPricing] = useState(null)
  const [priceDraft, setPriceDraft] = useState({})

  const handleEditPrice = (p) => {
    setEditPricing(p.config_id)
    setPriceDraft({ price_per_hour: p.price_per_hour, minimum_fee: p.minimum_fee, time_slot_name: p.time_slot_name })
  }

  const handleSavePrice = (config_id) => {
    updatePricing(config_id, {
      price_per_hour: Number(priceDraft.price_per_hour),
      minimum_fee:    Number(priceDraft.minimum_fee),
      time_slot_name: priceDraft.time_slot_name,
    })
    setEditPricing(null)
  }

  return (
    <div className="space-y-5">
      {}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          ['pricing', <DollarSign size={14}/>, 'Bảng giá'],
          ['lot',     <Building2 size={14}/>,  'Thông tin bãi xe'],
        ].map(([v, icon, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              tab === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            )}
          >
            {icon}{l}
          </button>
        ))}
      </div>

      {}
      {tab === 'pricing' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            Cấu hình mức phí gửi xe cho từng khung giờ. Thay đổi sẽ có hiệu lực ngay với các phiên tiếp theo.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pricing.map(p => (
              <div key={p.config_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                {editPricing === p.config_id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tên khung giờ</label>
                      <input
                        value={priceDraft.time_slot_name}
                        onChange={e => setPriceDraft(d => ({ ...d, time_slot_name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Giá / giờ (VND)</label>
                      <input
                        type="number"
                        value={priceDraft.price_per_hour}
                        onChange={e => setPriceDraft(d => ({ ...d, price_per_hour: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phí tối thiểu (VND)</label>
                      <input
                        type="number"
                        value={priceDraft.minimum_fee}
                        onChange={e => setPriceDraft(d => ({ ...d, minimum_fee: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleSavePrice(p.config_id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        <Save size={14}/> Lưu
                      </button>
                      <button
                        onClick={() => setEditPricing(null)}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        <X size={14}/>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <DollarSign size={18} className="text-blue-600" />
                      </div>
                      <button
                        onClick={() => handleEditPrice(p)}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Pencil size={16}/>
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-gray-800">{p.time_slot_name}</div>
                      <div className="text-gray-500 text-sm font-mono">{p.slot_start} – {p.slot_end}</div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Giá / giờ</span>
                        <span className="font-semibold text-gray-800">{fmtVND(p.price_per_hour)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Tối thiểu</span>
                        <span className="font-semibold text-gray-800">{fmtVND(p.minimum_fee)}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {p.is_active ? 'Đang áp dụng' : 'Không hoạt động'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      {tab === 'lot' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Thông tin bãi xe</h2>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <LotRow label="Tên bãi xe"       value={lot.name} />
            <LotRow label="Địa chỉ"           value={lot.address} />
            <LotRow label="Tổng sức chứa"     value={`${lot.total_capacity} chỗ`} />
            <LotRow label="Đang đỗ"           value={`${lot.current_occupancy} xe`} />
            <LotRow label="Còn trống"         value={`${lot.total_capacity - lot.current_occupancy} chỗ`} />
            <LotRow label="Trạng thái"        value={<span className="text-emerald-700 font-medium">Đang hoạt động</span>} />
          </div>
          <div className="px-5 pb-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <strong>Lưu ý:</strong> Đếm chỗ trống được tính tự động bằng phần mềm (số xe vào trừ số xe ra).
              Không cần phần cứng thêm.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LotRow({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  )
}

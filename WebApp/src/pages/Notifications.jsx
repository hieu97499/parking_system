import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Bell, BellOff, CheckCheck } from 'lucide-react';

function fmtDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

const TYPE_COLOR = {
  parking_entry:  'bg-green-100 text-green-600',
  parking_exit:   'bg-blue-100 text-blue-600',
  low_balance:    'bg-red-100 text-red-500',
  wallet_topup:   'bg-emerald-100 text-emerald-600',
  wallet_deduct:  'bg-orange-100 text-orange-600',
  system:         'bg-slate-100 text-slate-500',
};

export default function Notifications() {
  const { notifications, unreadCount, notifPage, fetchNotifications, markNotificationRead, markAllRead } = useStore();

  useEffect(() => { fetchNotifications(1); }, []);

  return (
    <div className="p-4 space-y-3">
      {}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {unreadCount > 0 ? `${unreadCount} chưa đọc` : 'Tất cả đã đọc'}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-sm text-blue-600 font-medium"
          >
            <CheckCheck size={15} /> Đọc tất cả
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BellOff size={40} className="mx-auto mb-3 opacity-30" />
          <p>Chưa có thông báo nào</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markNotificationRead(n.id)}
              className={`card cursor-pointer transition-colors
                ${!n.is_read ? 'bg-blue-50 border-blue-100' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                  ${TYPE_COLOR[n.notification_type] || 'bg-slate-100 text-slate-500'}`}>
                  <Bell size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-slate-300 mt-1">{fmtDateTime(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      <button
        onClick={() => fetchNotifications(notifPage + 1)}
        className="w-full text-sm text-slate-400 hover:text-slate-600 py-3"
      >
        Tải thêm thông báo
      </button>
    </div>
  );
}

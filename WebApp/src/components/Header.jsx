import { useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';

const PAGE_TITLES = {
  '/dashboard':      'Tổng quan',
  '/vehicles':       'Xe của tôi',
  '/sessions':       'Lịch sử gửi xe',
  '/wallet':         'Ví điện tử',
  '/notifications':  'Thông báo',
  '/profile':        'Hồ sơ',
  '/authorizations': 'Ủy quyền lấy xe',
};

export default function Header() {
  const location = useLocation();
  const currentUser = useStore(s => s.currentUser);
  const title = PAGE_TITLES[location.pathname] || 'ParkSmart';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">P</span>
          </div>
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
        {currentUser && (
          <div className="flex items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-700 text-sm font-semibold">
                {currentUser.full_name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

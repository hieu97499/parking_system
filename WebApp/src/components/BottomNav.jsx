import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  LayoutDashboard, Car, History, Wallet, UserCircle, CalendarCheck,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard',      icon: LayoutDashboard, label: 'Tổng quan' },
  { path: '/vehicles',       icon: Car,             label: 'Xe của tôi' },
  { path: '/sessions',       icon: History,         label: 'Lịch sử' },
  { path: '/monthly-passes', icon: CalendarCheck,   label: 'Vé tháng' },
  { path: '/wallet',         icon: Wallet,          label: 'Ví' },
  { path: '/profile',        icon: UserCircle,      label: 'Hồ sơ' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 z-40">
      <div className="grid grid-cols-6 h-16">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors
                ${active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

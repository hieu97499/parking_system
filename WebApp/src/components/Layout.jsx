import { Outlet } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto bg-white shadow-xl relative overflow-x-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 bg-slate-50">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

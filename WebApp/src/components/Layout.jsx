import { Outlet } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-white shadow-xl relative">
      <Header />
      <main className="flex-1 overflow-y-auto pb-20 bg-slate-50">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

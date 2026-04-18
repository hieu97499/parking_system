import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Sessions from './pages/Sessions';
import Wallet from './pages/Wallet';
import Authorizations from './pages/Authorizations';
import Profile from './pages/Profile';
import MonthlyPasses from './pages/MonthlyPasses';

function ProtectedRoute({ children }) {
  const isAuthenticated = useStore(s => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index                 element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"      element={<Dashboard />} />
          <Route path="vehicles"       element={<Vehicles />} />
          <Route path="sessions"       element={<Sessions />} />
          <Route path="wallet"         element={<Wallet />} />
          <Route path="authorizations" element={<Authorizations />} />
          <Route path="profile"        element={<Profile />} />
          <Route path="monthly-passes"  element={<MonthlyPasses />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

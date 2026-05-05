import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AdminDashboard from './pages/AdminDashboard';
import CourierPortal from './pages/CourierPortal';
import Login from './pages/Login';

export interface Notification {
  id: string;
  parcelId: string;
  customerName: string;
  deliveredAt: string;
  read: boolean;
}

type AuthData =
  | { role: 'admin' }
  | { role: 'courier'; courierId: number; courierName: string };

function App() {
  const [auth, setAuth] = useState<AuthData | null | undefined>(undefined);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAuth(d))
      .catch(() => setAuth(null));
  }, []);

  const addNotification = (n: Omit<Notification, 'id' | 'read'>) => {
    setNotifications(prev => [{ ...n, id: `${Date.now()}`, read: false }, ...prev]);
  };

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const dismissNotification = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setAuth(null);
    setNotifications([]);
  };

  if (auth === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui' }}>
        Loading…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          auth
            ? <Navigate to={auth.role === 'admin' ? '/' : '/courier'} replace />
            : <Login onLogin={data => setAuth(data as AuthData)} />
        } />
        <Route path="/" element={
          auth?.role === 'admin'
            ? <AdminDashboard
                notifications={notifications}
                onNewNotification={addNotification}
                onMarkAllRead={markAllRead}
                onDismissNotification={dismissNotification}
                onLogout={handleLogout}
              />
            : <Navigate to={auth ? '/courier' : '/login'} replace />
        } />
        <Route path="/courier" element={
          auth?.role === 'courier'
            ? <CourierPortal
                courierId={(auth as any).courierId}
                courierName={(auth as any).courierName}
                onLogout={handleLogout}
              />
            : <Navigate to={auth?.role === 'admin' ? '/' : '/login'} replace />
        } />
        <Route path="*" element={
          <Navigate to={auth ? (auth.role === 'admin' ? '/' : '/courier') : '/login'} replace />
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

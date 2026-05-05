import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import ParcelCard, { type Parcel } from '../components/ParcelCard';
import MetricCards from '../components/MetricCards';
import NotificationToast from '../components/NotificationToast';
import type { Notification } from '../App';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type StatusFilter = 'all' | 'pending' | 'delivered' | 'paid';
type Section = 'deliveries' | 'couriers';

interface Courier {
  id: number;
  username: string;
  name: string;
  active: number;
}

interface Props {
  notifications: Notification[];
  onNewNotification: (n: Omit<Notification, 'id' | 'read'>) => void;
  onMarkAllRead: () => void;
  onDismissNotification: (id: string) => void;
  onLogout: () => void;
}

interface NewDeliveryForm {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address: string;
  description: string;
  pieces: string;
  amount: string;
  assigned_courier_id: string;
}

interface NewCourierForm {
  name: string;
  username: string;
  password: string;
}

const EMPTY_DELIVERY: NewDeliveryForm = {
  id: '', customer_name: '', customer_email: '', customer_phone: '',
  address: '', description: '', pieces: '1', amount: '', assigned_courier_id: '',
};
const EMPTY_COURIER: NewCourierForm = { name: '', username: '', password: '' };

function buildChartData(parcels: Parcel[]) {
  const counts: Record<string, number> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    counts[d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })] = 0;
  }
  for (const p of parcels) {
    if ((p.status !== 'delivered' && p.status !== 'paid') || !p.delivered_at) continue;
    const key = new Date(p.delivered_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (key in counts) counts[key]++;
  }
  return Object.entries(counts).map(([date, deliveries]) => ({ date, deliveries }));
}

export default function AdminDashboard({ notifications, onNewNotification, onMarkAllRead, onDismissNotification, onLogout }: Props) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [section, setSection] = useState<Section>('deliveries');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [createDeliveryOpen, setCreateDeliveryOpen] = useState(false);
  const [createCourierOpen, setCreateCourierOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<NewDeliveryForm>(EMPTY_DELIVERY);
  const [courierForm, setCourierForm] = useState<NewCourierForm>(EMPTY_COURIER);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [creatingCourier, setCreatingCourier] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [courierError, setCourierError] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchParcels = useCallback(() => {
    fetch('/api/parcels', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setParcels(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchCouriers = useCallback(() => {
    fetch('/api/couriers', { credentials: 'include' })
      .then(r => r.json())
      .then(setCouriers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchParcels();
    fetchCouriers();
  }, [fetchParcels, fetchCouriers]);

  // Supabase Realtime — fires when any parcel transitions to 'delivered'
  useEffect(() => {
    const channel = supabase
      .channel('admin-deliveries')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parcels' }, (payload: any) => {
        if (payload.new?.status === 'delivered') {
          onNewNotification({
            parcelId: payload.new.id,
            customerName: payload.new.customer_name,
            deliveredAt: payload.new.delivered_at,
          });
        }
        fetchParcels();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [onNewNotification, fetchParcels]);

  const handleMarkPaid = async (id: string) => {
    await fetch(`/api/parcels/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'paid' }),
    });
    fetchParcels();
  };

  const handleCreateDelivery = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingDelivery(true);
    setDeliveryError('');
    try {
      const res = await fetch('/api/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...deliveryForm,
          pieces: deliveryForm.pieces ? parseInt(deliveryForm.pieces, 10) : 1,
          amount: deliveryForm.amount ? parseFloat(deliveryForm.amount) : undefined,
          assigned_courier_id: deliveryForm.assigned_courier_id || undefined,
        }),
      });
      if (res.ok) {
        setDeliveryForm(EMPTY_DELIVERY);
        setCreateDeliveryOpen(false);
        fetchParcels();
      } else {
        const data = await res.json();
        setDeliveryError(data.error ?? 'Failed to create delivery');
      }
    } catch {
      setDeliveryError('Network error');
    } finally {
      setCreatingDelivery(false);
    }
  };

  const handleCreateCourier = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingCourier(true);
    setCourierError('');
    try {
      const res = await fetch('/api/couriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(courierForm),
      });
      if (res.ok) {
        setCourierForm(EMPTY_COURIER);
        setCreateCourierOpen(false);
        fetchCouriers();
      } else {
        const data = await res.json();
        setCourierError(data.error ?? 'Failed to create courier');
      }
    } catch {
      setCourierError('Network error');
    } finally {
      setCreatingCourier(false);
    }
  };

  const handleToggleCourierActive = async (courier: Courier) => {
    await fetch(`/api/couriers/${courier.id}/active`, { method: 'PATCH', credentials: 'include' });
    fetchCouriers();
  };

  const handleNotifClick = (parcelId: string) => {
    setNotifPanelOpen(false);
    setSection('deliveries');
    setFilter('all');
    setHighlightedId(parcelId);
    setTimeout(() => {
      document.getElementById(`parcel-${parcelId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedId(null), 2000);
    }, 100);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = filter === 'all' ? parcels : parcels.filter(p => p.status === filter);

  return (
    <div className="dashboard">
      <nav className="nav">
        <div className="nav-brand"><span>🚚</span><span>DeliveryTrack</span></div>
        <div className="nav-actions">
          <button
            className="notif-bell"
            onClick={() => { setNotifPanelOpen(true); onMarkAllRead(); }}
            aria-label={`Notifications (${unreadCount} unread)`}
          >
            🔔
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-top">
          <div>
            <h1>Dashboard</h1>
            <p className="page-subtitle">Manage your deliveries</p>
          </div>
          {section === 'deliveries' && (
            <button className="btn btn-primary" onClick={() => setCreateDeliveryOpen(true)}>+ New Delivery</button>
          )}
          {section === 'couriers' && (
            <button className="btn btn-primary" onClick={() => setCreateCourierOpen(true)}>+ Add Courier</button>
          )}
        </div>

        <div className="filter-tabs" style={{ marginBottom: 20 }}>
          <button className={`filter-tab${section === 'deliveries' ? ' active' : ''}`} onClick={() => setSection('deliveries')}>Deliveries</button>
          <button className={`filter-tab${section === 'couriers' ? ' active' : ''}`} onClick={() => setSection('couriers')}>
            Couriers <span className="tab-count">{couriers.length}</span>
          </button>
        </div>

        {section === 'deliveries' && (
          <>
            <MetricCards parcels={parcels} />
            <div className="chart-card">
              <h3>Deliveries — last 7 days</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={buildChartData(parcels)} barSize={24}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="deliveries" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="filter-tabs">
              {(['all', 'pending', 'delivered', 'paid'] as StatusFilter[]).map(s => (
                <button key={s} className={`filter-tab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  {s !== 'all' && <span className="tab-count">{parcels.filter(p => p.status === s).length}</span>}
                </button>
              ))}
            </div>
            {loading ? (
              <p className="loading-text">Loading deliveries…</p>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <p>No {filter !== 'all' ? filter : ''} deliveries found.</p>
                {filter === 'all' && <button className="btn btn-primary" onClick={() => setCreateDeliveryOpen(true)}>Create first delivery</button>}
              </div>
            ) : (
              <div className="parcel-list">
                {filtered.map(parcel => (
                  <ParcelCard key={parcel.id} parcel={parcel} highlighted={highlightedId === parcel.id} onMarkPaid={handleMarkPaid} couriers={couriers} />
                ))}
              </div>
            )}
          </>
        )}

        {section === 'couriers' && (
          <div className="couriers-section">
            {couriers.length === 0 ? (
              <div className="empty-state">
                <p>No couriers yet.</p>
                <button className="btn btn-primary" onClick={() => setCreateCourierOpen(true)}>Add first courier</button>
              </div>
            ) : (
              <div className="courier-list">
                {couriers.map(c => (
                  <div key={c.id} className="courier-item">
                    <div className="courier-item-info">
                      <span className="courier-item-name">{c.name}</span>
                      <span className="courier-item-username">@{c.username}</span>
                    </div>
                    <div className="courier-item-actions">
                      <span className={`courier-status-badge ${c.active ? 'active' : 'inactive'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggleCourierActive(c)}>
                        {c.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {createDeliveryOpen && (
        <div className="modal-overlay" onClick={() => setCreateDeliveryOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Delivery</h3>
              <button className="modal-close" onClick={() => setCreateDeliveryOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateDelivery} className="modal-form">
              <div className="field">
                <label>Invoice number <span className="required">*</span></label>
                <input value={deliveryForm.id} onChange={e => setDeliveryForm(f => ({ ...f, id: e.target.value }))} placeholder="e.g. INV-10432" required />
              </div>
              <div className="field">
                <label>Customer name <span className="required">*</span></label>
                <input value={deliveryForm.customer_name} onChange={e => setDeliveryForm(f => ({ ...f, customer_name: e.target.value }))} required />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={deliveryForm.customer_email} onChange={e => setDeliveryForm(f => ({ ...f, customer_email: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input type="tel" value={deliveryForm.customer_phone} onChange={e => setDeliveryForm(f => ({ ...f, customer_phone: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Delivery address</label>
                <input value={deliveryForm.address} onChange={e => setDeliveryForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, City, Province" />
              </div>
              <div className="field">
                <label>Description</label>
                <input value={deliveryForm.description} onChange={e => setDeliveryForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 3-piece lounge suite + coffee table" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Pieces</label>
                  <input type="number" min="1" value={deliveryForm.pieces} onChange={e => setDeliveryForm(f => ({ ...f, pieces: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Amount due (R)</label>
                  <input type="number" min="0" step="0.01" value={deliveryForm.amount} onChange={e => setDeliveryForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="field">
                <label>Assign to courier</label>
                <select value={deliveryForm.assigned_courier_id} onChange={e => setDeliveryForm(f => ({ ...f, assigned_courier_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {couriers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {deliveryError && <p className="error-msg">{deliveryError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCreateDeliveryOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingDelivery}>{creatingDelivery ? 'Creating…' : 'Create Delivery'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createCourierOpen && (
        <div className="modal-overlay" onClick={() => setCreateCourierOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Courier</h3>
              <button className="modal-close" onClick={() => setCreateCourierOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateCourier} className="modal-form">
              <div className="field">
                <label>Full name <span className="required">*</span></label>
                <input value={courierForm.name} onChange={e => setCourierForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. John Smith" required />
              </div>
              <div className="field">
                <label>Username <span className="required">*</span></label>
                <input value={courierForm.username} onChange={e => setCourierForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. johnsmith" autoComplete="off" required />
              </div>
              <div className="field">
                <label>Password <span className="required">*</span></label>
                <input type="password" value={courierForm.password} onChange={e => setCourierForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" required />
              </div>
              {courierError && <p className="error-msg">{courierError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCreateCourierOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingCourier}>{creatingCourier ? 'Creating…' : 'Add Courier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notifPanelOpen && (
        <>
          <div className="panel-backdrop" onClick={() => setNotifPanelOpen(false)} />
          <div className="notif-panel">
            <div className="notif-panel-header">
              <h3>Notifications</h3>
              <button className="modal-close" onClick={() => setNotifPanelOpen(false)}>×</button>
            </div>
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications yet</p>
            ) : (
              <ul className="notif-list">
                {notifications.map(n => (
                  <li key={n.id} className="notif-item" onClick={() => handleNotifClick(n.parcelId)}>
                    <span className="notif-icon">✓</span>
                    <div className="notif-text">
                      <strong>POD received — {n.parcelId}</strong><br />
                      <small>{n.customerName}</small>
                    </div>
                    <span className="notif-time">{new Date(n.deliveredAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <NotificationToast notifications={notifications} onDismiss={onDismissNotification} />
    </div>
  );
}

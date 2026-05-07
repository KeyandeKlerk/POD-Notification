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
  pieces: string;
  assigned_courier_id: string;
  notify_emails: string[];
}

interface NewCourierForm {
  name: string;
  username: string;
  password: string;
}

interface EditDeliveryForm {
  customer_name: string;
  pieces: string;
  assigned_courier_id: string;
  notify_emails: string[];
}

const EMPTY_DELIVERY: NewDeliveryForm = {
  id: '', customer_name: '', pieces: '1', assigned_courier_id: '', notify_emails: [],
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

function NotifyEmailsInput({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
}) {
  const update = (i: number, val: string) => {
    const next = [...emails];
    next[i] = val;
    onChange(next);
  };
  const add = () => { if (emails.length < 3) onChange([...emails, '']); };
  const remove = (i: number) => onChange(emails.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>Notify emails <span className="optional">(up to 3)</span></label>
      {emails.map((email, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            type="email"
            value={email}
            onChange={e => update(i, e.target.value)}
            placeholder="recipient@example.com"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => remove(i)}
            style={{ padding: '4px 10px' }}
          >
            ×
          </button>
        </div>
      ))}
      {emails.length < 3 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} style={{ marginTop: 2 }}>
          + Add email
        </button>
      )}
    </div>
  );
}

export default function AdminDashboard({ notifications, onNewNotification, onMarkAllRead, onDismissNotification, onLogout }: Props) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [section, setSection] = useState<Section>('deliveries');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // Create delivery
  const [createDeliveryOpen, setCreateDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<NewDeliveryForm>(EMPTY_DELIVERY);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  // Edit delivery
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [editForm, setEditForm] = useState<EditDeliveryForm>({ customer_name: '', pieces: '1', assigned_courier_id: '', notify_emails: [] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Couriers
  const [createCourierOpen, setCreateCourierOpen] = useState(false);
  const [courierForm, setCourierForm] = useState<NewCourierForm>(EMPTY_COURIER);
  const [creatingCourier, setCreatingCourier] = useState(false);
  const [courierError, setCourierError] = useState('');
  const [deletingCourierId, setDeletingCourierId] = useState<number | null>(null);
  const [courierDeleteError, setCourierDeleteError] = useState<Record<number, string>>({});

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
          setEditingParcel(prev => (prev?.id === payload.new.id ? null : prev));
        }
        fetchParcels();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [onNewNotification, fetchParcels]);

  const handleMarkPaid = async (id: string) => {
    await fetch(`/api/parcels/${encodeURIComponent(id)}/status`, {
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
          id: deliveryForm.id,
          customer_name: deliveryForm.customer_name,
          pieces: deliveryForm.pieces ? parseInt(deliveryForm.pieces, 10) : 1,
          assigned_courier_id: deliveryForm.assigned_courier_id || undefined,
          notify_emails: deliveryForm.notify_emails.filter(Boolean),
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

  const handleOpenEdit = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setEditForm({
      customer_name: parcel.customer_name,
      pieces: String(parcel.pieces),
      assigned_courier_id: parcel.assigned_courier_id ? String(parcel.assigned_courier_id) : '',
      notify_emails: parcel.notify_emails?.length ? [...parcel.notify_emails] : [],
    });
    setEditError('');
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingParcel) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`/api/parcels/${encodeURIComponent(editingParcel.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_name: editForm.customer_name,
          pieces: editForm.pieces ? parseInt(editForm.pieces, 10) : 1,
          assigned_courier_id: editForm.assigned_courier_id || null,
          notify_emails: editForm.notify_emails.filter(Boolean),
        }),
      });
      if (res.ok) {
        setEditingParcel(null);
        fetchParcels();
      } else {
        const data = await res.json();
        setEditError(data.error ?? 'Failed to save changes');
      }
    } catch {
      setEditError('Network error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteParcel = async (id: string) => {
    const res = await fetch(`/api/parcels/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'Failed to delete delivery');
    }
    fetchParcels();
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

  const handleDeleteCourier = async (courier: Courier) => {
    const res = await fetch(`/api/couriers/${courier.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeletingCourierId(null);
      fetchCouriers();
    } else {
      const data = await res.json().catch(() => ({}));
      setCourierDeleteError(prev => ({ ...prev, [courier.id]: data.error ?? 'Failed to delete courier' }));
      setDeletingCourierId(null);
    }
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
        <div className="nav-brand"><img src="/logo.jpeg" alt="Logo" className="nav-logo" /></div>
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
                  <ParcelCard
                    key={parcel.id}
                    parcel={parcel}
                    highlighted={highlightedId === parcel.id}
                    onMarkPaid={handleMarkPaid}
                    onEdit={handleOpenEdit}
                    onDelete={handleDeleteParcel}
                    couriers={couriers}
                  />
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
                      {deletingCourierId === c.id ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <span style={{ color: '#dc2626' }}>Remove?</span>
                          <button
                            className="btn btn-sm"
                            style={{ background: '#dc2626', color: '#fff', padding: '2px 8px' }}
                            onClick={() => handleDeleteCourier(c)}
                          >
                            Yes
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 8px' }}
                            onClick={() => setDeletingCourierId(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#dc2626', padding: '4px 10px' }}
                          onClick={() => { setDeletingCourierId(c.id); setCourierDeleteError(prev => ({ ...prev, [c.id]: '' })); }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {courierDeleteError[c.id] && (
                      <p className="error-msg" style={{ marginTop: 4, flexBasis: '100%' }}>{courierDeleteError[c.id]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create delivery modal */}
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
              <div className="field">
                <label>Pieces</label>
                <input type="number" min="1" value={deliveryForm.pieces} onChange={e => setDeliveryForm(f => ({ ...f, pieces: e.target.value }))} />
              </div>
              <div className="field">
                <label>Assign to courier <span className="required">*</span></label>
                <select
                  value={deliveryForm.assigned_courier_id}
                  onChange={e => setDeliveryForm(f => ({ ...f, assigned_courier_id: e.target.value }))}
                  required
                >
                  <option value="">— Select a courier —</option>
                  {couriers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!deliveryForm.assigned_courier_id && (
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>A courier must be assigned before creating a delivery.</p>
                )}
              </div>
              <NotifyEmailsInput
                emails={deliveryForm.notify_emails}
                onChange={emails => setDeliveryForm(f => ({ ...f, notify_emails: emails }))}
              />
              {deliveryError && <p className="error-msg">{deliveryError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCreateDeliveryOpen(false)}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingDelivery || !deliveryForm.assigned_courier_id}
                >
                  {creatingDelivery ? 'Creating…' : 'Create Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit delivery modal */}
      {editingParcel && (
        <div className="modal-overlay" onClick={() => setEditingParcel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Delivery — {editingParcel.id}</h3>
              <button className="modal-close" onClick={() => setEditingParcel(null)}>×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="modal-form">
              <div className="field">
                <label>Customer name <span className="required">*</span></label>
                <input value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} required />
              </div>
              <div className="field">
                <label>Pieces</label>
                <input type="number" min="1" value={editForm.pieces} onChange={e => setEditForm(f => ({ ...f, pieces: e.target.value }))} />
              </div>
              <div className="field">
                <label>Assign to courier</label>
                <select value={editForm.assigned_courier_id} onChange={e => setEditForm(f => ({ ...f, assigned_courier_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {couriers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <NotifyEmailsInput
                emails={editForm.notify_emails}
                onChange={emails => setEditForm(f => ({ ...f, notify_emails: emails }))}
              />
              {editError && <p className="error-msg">{editError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingParcel(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add courier modal */}
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

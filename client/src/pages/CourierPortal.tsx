import { useState, useEffect, useRef, type FormEvent } from 'react';

interface Delivery {
  id: string;
  customer_name: string;
  address?: string;
  description?: string;
  pieces: number;
  amount?: number;
}

type View = { type: 'list' } | { type: 'detail'; delivery: Delivery };

interface Props {
  courierId: number;
  courierName: string;
  onLogout: () => void;
}

export default function CourierPortal({ courierName, onLogout }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ type: 'list' });
  const [loading, setLoading] = useState(true);

  const fetchDeliveries = async (q = '') => {
    setLoading(true);
    const url = q
      ? `/api/pod/deliveries?search=${encodeURIComponent(q)}`
      : '/api/pod/deliveries';
    try {
      const res = await fetch(url, { credentials: 'include' });
      setDeliveries(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeliveries(); }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchDeliveries(search);
  };

  if (view.type === 'detail') {
    return (
      <DeliveryDetail
        delivery={view.delivery}
        onBack={() => { setView({ type: 'list' }); fetchDeliveries(search); }}
      />
    );
  }

  return (
    <div className="courier-portal">
      <header className="courier-header">
        <div className="courier-header-inner">
          <div>
            <span className="courier-brand"><img src="/logo.jpeg" alt="Logo" className="nav-logo" /></span>
            <p className="courier-greeting">Hi, {courierName}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="courier-main">
        <form onSubmit={handleSearch} className="courier-search-form">
          <input
            className="courier-search-input"
            type="search"
            placeholder="Search by invoice number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
        </form>

        {loading ? (
          <p className="loading-text">Loading deliveries…</p>
        ) : deliveries.length === 0 ? (
          <div className="empty-state">
            <p>No pending deliveries{search ? ' matching your search' : ''}.</p>
          </div>
        ) : (
          <div className="c-delivery-list">
            {deliveries.map(d => (
              <button
                key={d.id}
                className="c-delivery-card"
                onClick={() => setView({ type: 'detail', delivery: d })}
              >
                <div className="c-delivery-card-header">
                  <span className="c-invoice">{d.id}</span>
                  <span className="c-pieces-badge">
                    {d.pieces} {d.pieces === 1 ? 'piece' : 'pieces'}
                  </span>
                </div>
                <p className="c-customer">{d.customer_name}</p>
                {d.address && <p className="c-address">{d.address}</p>}
                {d.description && <p className="c-desc">{d.description}</p>}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DeliveryDetail({ delivery, onBack }: { delivery: Delivery; onBack: () => void }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    setPhotos(prev => [...prev, ...newFiles]);
    newFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (i: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (photos.length === 0) { setError('At least one photo is required.'); return; }
    setSubmitting(true);
    setError('');
    const form = new FormData();
    photos.forEach(p => form.append('photos', p));
    form.append('notes', notes);
    try {
      const res = await fetch(`/api/pod/${delivery.id}/confirm`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to confirm delivery.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="courier-portal">
        <div className="pod-success">
          <div className="pod-success-icon">✓</div>
          <h2>Delivery Confirmed</h2>
          <p className="pod-success-invoice">{delivery.id}</p>
          <p className="pod-success-customer">{delivery.customer_name}</p>
          <button className="btn btn-primary" onClick={onBack}>Back to deliveries</button>
        </div>
      </div>
    );
  }

  return (
    <div className="courier-portal">
      <header className="courier-header">
        <div className="courier-header-inner">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <span className="courier-brand">Confirm Delivery</span>
        </div>
      </header>

      <main className="courier-main">
        <div className="pod-invoice-banner">
          <span className="pod-invoice-label">Invoice</span>
          <span className="pod-invoice-number">{delivery.id}</span>
        </div>

        <div className="pod-info-card">
          <p className="pod-customer">{delivery.customer_name}</p>
          {delivery.address && <p className="pod-address">{delivery.address}</p>}
          {delivery.description && <p className="pod-desc">{delivery.description}</p>}
          <p className="pod-pieces">{delivery.pieces} {delivery.pieces === 1 ? 'piece' : 'pieces'}</p>
          {delivery.amount != null && (
            <p className="pod-amount">COD: R{delivery.amount.toFixed(2)}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="pod-form">
          <div className="pod-photos-section">
            <label className="pod-section-label">
              Proof of delivery photos <span className="required">*</span>
            </label>

            {previews.length > 0 && (
              <div className="pod-photos-grid">
                {previews.map((src, i) => (
                  <div key={i} className="pod-photo-thumb">
                    <img src={src} alt={`Photo ${i + 1}`} />
                    <button
                      type="button"
                      className="pod-photo-remove"
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="pod-add-photo-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: 'none' }}
              onChange={e => { addPhotos(e.target.files); e.target.value = ''; }}
            />
          </div>

          <div className="field">
            <label className="pod-section-label">Notes <span className="optional">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any delivery notes…"
              rows={3}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={submitting}
          >
            {submitting ? 'Confirming…' : 'Confirm delivery'}
          </button>
        </form>
      </main>
    </div>
  );
}

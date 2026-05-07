import { useState } from 'react';

export interface Parcel {
  id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  address?: string;
  description?: string;
  pieces: number;
  amount?: number;
  status: 'pending' | 'delivered' | 'paid';
  assigned_courier_id?: number;
  created_at: string;
  delivered_at?: string;
  driver_notes?: string;
  photos: string[];
  notify_emails?: string[];
}

interface Courier {
  id: number;
  name: string;
  active: number;
}

interface Props {
  parcel: Parcel;
  highlighted: boolean;
  onMarkPaid: (id: string) => void;
  onEdit?: (parcel: Parcel) => void;
  onDelete?: (id: string) => void;
  couriers?: Courier[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  paid: 'Paid',
};

export default function ParcelCard({ parcel, highlighted, onMarkPaid, onEdit, onDelete, couriers = [] }: Props) {
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const assignedCourier = parcel.assigned_courier_id
    ? couriers.find(c => c.id === parcel.assigned_courier_id)
    : null;

  return (
    <>
      <div
        id={`parcel-${parcel.id}`}
        className={`parcel-card status-${parcel.status}${highlighted ? ' highlighted' : ''}`}
      >
        <div className="parcel-header">
          <div className="parcel-id-block">
            <span className="parcel-id">{parcel.id}</span>
            <span className={`status-badge status-${parcel.status}`}>{STATUS_LABELS[parcel.status]}</span>
            {parcel.pieces > 1 && (
              <span className="pieces-tag">{parcel.pieces} pieces</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="parcel-date">{fmt(parcel.created_at)}</span>
            {parcel.status === 'pending' && onEdit && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onEdit(parcel)}
                title="Edit delivery"
                style={{ padding: '2px 8px', fontSize: 13 }}
              >
                Edit
              </button>
            )}
            {parcel.status === 'pending' && onDelete && !confirmDelete && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(true)}
                title="Delete delivery"
                style={{ padding: '2px 8px', fontSize: 13, color: '#dc2626' }}
              >
                Delete
              </button>
            )}
            {confirmDelete && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ color: '#dc2626' }}>Delete?</span>
                <button
                  className="btn btn-sm"
                  style={{ background: '#dc2626', color: '#fff', padding: '2px 8px' }}
                  onClick={() => { onDelete?.(parcel.id); setConfirmDelete(false); }}
                >
                  Yes
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 8px' }}
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="parcel-body">
          <div className="parcel-info">
            <p className="parcel-customer">{parcel.customer_name}</p>
            {parcel.address && <p className="parcel-address">{parcel.address}</p>}
            {parcel.description && <p className="parcel-desc">{parcel.description}</p>}
            {assignedCourier && (
              <p className="parcel-courier">Courier: {assignedCourier.name}</p>
            )}
            {parcel.amount != null && (
              <p className="parcel-amount">R{parcel.amount.toFixed(2)}</p>
            )}
          </div>

          {parcel.photos.length > 0 && (
            <div className="pod-thumbs">
              {parcel.photos.slice(0, 4).map((src, i) => (
                <button
                  key={i}
                  className="photo-thumb-btn"
                  onClick={() => setLightboxPhoto(src)}
                  aria-label={`View photo ${i + 1}`}
                >
                  <img src={src} alt={`POD ${i + 1}`} className="photo-thumb" />
                  {i === 3 && parcel.photos.length > 4 && (
                    <span className="photo-more">+{parcel.photos.length - 4}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {parcel.status === 'delivered' && (
          <div className="parcel-delivery-info">
            {parcel.delivered_at && (
              <p className="delivered-time">Delivered {fmt(parcel.delivered_at)}</p>
            )}
            {parcel.driver_notes && (
              <p className="driver-notes">"{parcel.driver_notes}"</p>
            )}
            <button className="btn btn-paid" onClick={() => onMarkPaid(parcel.id)}>
              Mark as Paid
            </button>
          </div>
        )}

        {parcel.status === 'paid' && parcel.delivered_at && (
          <p className="delivered-time" style={{ marginTop: 10 }}>Delivered {fmt(parcel.delivered_at)}</p>
        )}
      </div>

      {lightboxPhoto && (
        <div className="lightbox-overlay" onClick={() => setLightboxPhoto(null)}>
          <button className="lightbox-close" aria-label="Close">×</button>
          {parcel.photos.length > 1 && (
            <div className="lightbox-thumbs" onClick={e => e.stopPropagation()}>
              {parcel.photos.map((src, i) => (
                <button
                  key={i}
                  className={`lightbox-thumb-btn${lightboxPhoto === src ? ' active' : ''}`}
                  onClick={() => setLightboxPhoto(src)}
                >
                  <img src={src} alt={`Photo ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
          <img
            src={lightboxPhoto}
            alt="Proof of delivery"
            className="lightbox-img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

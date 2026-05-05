import { useEffect } from 'react';
import type { Notification } from '../App';

interface Props {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export default function NotificationToast({ notifications, onDismiss }: Props) {
  const recent = notifications.filter(n => !n.read).slice(0, 3);

  useEffect(() => {
    if (recent.length === 0) return;
    const latest = recent[0];
    if (!latest) return;
    const timer = setTimeout(() => onDismiss(latest.id), 6000);
    return () => clearTimeout(timer);
  }, [recent, onDismiss]);

  if (recent.length === 0) return null;

  return (
    <div className="toast-container">
      {recent.map(n => (
        <div key={n.id} className="toast">
          <div className="toast-content">
            <span className="toast-icon">✓</span>
            <div>
              <strong>POD received — {n.parcelId}</strong>
              <span> — {n.customerName}</span>
            </div>
          </div>
          <button className="toast-close" onClick={() => onDismiss(n.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

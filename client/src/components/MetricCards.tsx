interface Parcel {
  id: string;
  status: string;
  delivered_at?: string;
}

interface Props {
  parcels: Parcel[];
}

export default function MetricCards({ parcels }: Props) {
  const today = new Date().toDateString();
  const deliveredToday = parcels.filter(p =>
    p.status === 'delivered' && p.delivered_at && new Date(p.delivered_at).toDateString() === today
  ).length;
  const awaitingPayment = parcels.filter(p => p.status === 'delivered').length;

  const metrics = [
    { label: 'Total Deliveries', value: parcels.length, color: '#6366f1' },
    { label: 'Delivered Today', value: deliveredToday, color: '#22c55e' },
    { label: 'Awaiting Payment', value: awaitingPayment, color: '#f59e0b' },
  ];

  return (
    <div className="metrics-row">
      {metrics.map(m => (
        <div key={m.label} className="metric-card" style={{ '--accent': m.color } as React.CSSProperties}>
          <span className="metric-value">{m.value}</span>
          <span className="metric-label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

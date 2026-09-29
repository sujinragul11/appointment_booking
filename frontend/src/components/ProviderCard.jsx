import { Link } from 'react-router-dom';
import StarRating from './StarRating';
import { formatMoney } from '../utils/format';

const ICO = {
  'Doctor': '\u2695', 'Dentist': '\u2637', 'Salon & Spa': '\u2726', 'Consultant': '\u2666',
  'Tutor': '\u270E', 'Fitness': '\u269A', 'Dermatology': '\u2695', 'Physiotherapy': '\u2664'
};

export default function ProviderCard({ p }) {
  const icon = ICO[p.category?.name] || '\u2726';
  const best = p.services?.[0];
  return (
    <Link to={`/providers/${p.id}`} className="card card-hover provider-card">
      <div className="provider-cover" style={{ background: `linear-gradient(135deg, ${p.logoUrl ? 'transparent' : '#eef2ff'}, #f5f3ff)` }}>
        {p.coverUrl && <img src={p.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div className="provider-logo-wrap">
        <div className="provider-logo">
          {p.logoUrl ? <img src={p.logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12 }} /> : <span>{icon}</span>}
        </div>
      </div>
      <div className="provider-card-body">
        <div>
          <h3>{p.businessName}</h3>
          <div className="meta mt-1">
            <span className="rating-pill">&#9733; {p.rating?.toFixed?.(1) ?? p.rating}</span>
            <span>{p.reviewCount} reviews</span>
            <span>{'\u2022'}</span>
            <span>{p.city}</span>
          </div>
        </div>
        <p style={{ fontSize: '0.87rem', color: 'var(--muted)', flex: 1 }} className="mt-1">
          {p.description ? p.description.slice(0, 110) : p.category?.name || 'Professional services'}
        </p>
        <div className="meta">
          {best ? <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{formatMoney(best.price)}</span> : null}
          <span style={{ fontWeight: 600, color: 'var(--brand-600)' }}>Book now &rarr;</span>
        </div>
      </div>
    </Link>
  );
}
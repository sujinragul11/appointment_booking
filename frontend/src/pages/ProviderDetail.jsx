import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Loader from '../components/Loader';
import StarRating from '../components/StarRating';
import StatusBadge from '../components/StatusBadge';
import { formatMoney, formatDateTime, initials } from '../utils/format';

export default function ProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [provider, setProvider] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avail, setAvail] = useState(null);

  useEffect(() => {
    api.get(`/providers/${id}`).then((r) => setProvider(r.data)).catch(() => {});
    api.get(`/providers/${id}/reviews`).then((r) => setReviews(r.data)).catch(() => {});
    api.get(`/providers/${id}/availability`).then((r) => setAvail(r.data)).catch(() => {});
  }, [id]);

  if (!provider) return <Loader />;

  const services = provider.services || [];
  const staff = provider.staff || [];
  const branches = provider.branches || [];

  return (
    <div className="container page">
      <Link to="/providers" className="link-more" style={{ fontSize: '0.9rem' }}>&larr; Back to providers</Link>

      <div className="card mt-2" style={{ position: 'relative' }}>
        <div className="provider-cover" style={{ height: 180, background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)' }}>
          {provider.coverUrl && <img src={provider.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="provider-logo-wrap" style={{ padding: 0, marginTop: -38 }}>
            <div className="provider-logo" style={{ width: 84, height: 84, fontSize: '2rem' }}>
              {provider.logoUrl ? <img src={provider.logoUrl} alt="" style={{ width: 76, height: 76, borderRadius: 14 }} /> : (provider.category?.icon || '\u2726')}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{provider.businessName}</h1>
                <StatusBadge status={provider.status} />
              </div>
              <div className="mt-1" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="rating-pill">&#9733; {provider.rating?.toFixed?.(1) ?? provider.rating}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{provider.reviewCount} reviews</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{provider.city}{provider.city && provider.state ? ', ' : ''}{provider.state}</span>
                {provider.website && <a href={provider.website} target="_blank" rel="noreferrer">{provider.website}</a>}
              </div>
              {provider.description && <p className="mt-2" style={{ color: 'var(--ink-2)', maxWidth: 640 }}>{provider.description}</p>}
            </div>
            {services.length > 0 && (
              <Link className="btn btn-primary btn-lg mt-2" to={`/book/${provider.id}/${services[0].id}`}>
                Book now
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 grid mt-4" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {services.length > 0 && (
            <section className="card">
              <div className="card-pad">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 16 }}>Services &amp; pricing</h2>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {services.map((s) => (
                    <div key={s.id} className="list-item">
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <div style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>{s.durationMin}-{s.durationMin + s.bufferMin} min</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{formatMoney(s.price)}</div>
                      <Link className="btn btn-outline btn-sm" to={`/book/${provider.id}/${s.id}`}>Book</Link>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {staff.length > 0 && (
            <section className="card">
              <div className="card-pad">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 8 }}>Meet the team</h2>
                <div className="grid grid-3 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))' }}>
                  {staff.map((s) => (
                    <div key={s.id} className="card card-pad" style={{ textAlign: 'center' }}>
                      <div className="avatar" style={{ width: 56, height: 56, margin: '0 auto', fontSize: '1.1rem' }}>
                        {s.photoUrl ? <img src={s.photoUrl} alt="" /> : initials(s.name)}
                      </div>
                      <div style={{ fontWeight: 700, marginTop: 10 }}>{s.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{s.designation}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {branches.length > 0 && (
            <section className="card">
              <div className="card-pad">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 12 }}>Locations</h2>
                {branches.map((b) => (
                  <div key={b.id} className="list-item">
                    <div className="avatar" style={{ width: 40, height: 40 }}>{'\u{1F4CD}'}</div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{b.name}{b.main ? ' \u2022 Main' : ''}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {[b.address, b.city, b.state, b.country].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-pad">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 16 }}>Customer reviews</h2>
              {reviews.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>No reviews yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {reviews.map((r) => (
                    <div key={r.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                      <div className="avatar-row">
                        <div className="avatar" style={{ width: 38, height: 38 }}>{initials(r.customerName)}</div>
                        <div>
                          <div className="nm">{r.customerName}</div>
                          <StarRating value={r.rating} size="0.8rem" />
                        </div>
                        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '0.8rem' }}>{formatDateTime(r.createdAt)}</span>
                      </div>
                      {r.comment && <p className="mt-1" style={{ fontSize: '0.93rem' }}>{r.comment}</p>}
                      {r.reply && (
                        <div className="mt-2" style={{ background: 'var(--gradient-soft)', borderRadius: 10, padding: '10px 14px', fontSize: '0.9rem' }}>
                          <strong style={{ color: 'var(--brand-700)' }}>Provider reply:</strong> {r.reply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div style={{ position: 'sticky', top: 100, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card card-pad">
            <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Working hours</h3>
            {avail?.availability?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {avail.availability.map((a) => (
                  <div key={a.id} className="list-item" style={{ padding: '10px 2px', borderColor: '#f8fafc' }}>
                    <span style={{ fontWeight: 600, width: 90 }}>{a.dayName}</span>
                    <span style={{ color: 'var(--ink-2)', fontSize: '0.9rem' }}>
                      {a.startTime.slice(0, 5)} - {a.endTime.slice(0, 5)}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Hours not published yet.</p>}
          </div>

          <div className="card card-pad">
            <h3 style={{ fontWeight: 800, marginBottom: 10 }}>Booking info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.92rem' }}>
              <div><strong>Advance booking:</strong> up to {provider.maxAdvanceBookingDays} days</div>
              <div><strong>Cancellation:</strong> {provider.cancellationPolicy || 'Standard policy applies'}</div>
              <div><strong>Phone:</strong> {provider.phone || 'Not listed'}</div>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" onClick={() => navigate(`/book/${provider.id}/${services[0]?.id || ''}`)}>
            Book an appointment
          </button>
        </div>
      </div>
    </div>
  );
}
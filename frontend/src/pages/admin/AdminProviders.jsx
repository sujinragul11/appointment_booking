import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminProviders() {
  const [pending, setPending] = useState(null);
  const [all, setAll] = useState(null);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get('/admin/providers/pending').then((r) => setPending(r.data)).catch(() => setPending([]));
    api.get('/providers?page=0&size=20').then((r) => setAll(r.data.content || [])).catch(() => setAll([]));
  }, []);

  const decide = async (status) => {
    setBusy(true);
    try {
      await api.put(`/admin/providers/${review.id}/decision`, { status, note: note || null });
      toast(`${review.businessName} ${status.toLowerCase()}`, 'success');
      setReview(null);
      setNote('');
      const p = (await api.get('/admin/providers/pending')).data;
      setPending(p);
      const a = (await api.get('/providers?page=0&size=20')).data;
      setAll(a.content || []);
    } catch (e) { toast(getErrorMessage(e), 'error'); } finally { setBusy(false); }
  };

  const pendingCards = pending || [];

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/admin">Overview</Link>
          <Link to="/dashboard/admin/providers" className="active">Providers</Link>
          <Link to="/dashboard/admin/users">Users</Link>
          <Link to="/dashboard/admin/coupons">Coupons</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Providers</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Approve new businesses and manage listings</p>

        <h2 style={{ fontWeight: 800, fontSize: '1.15rem', margin: '0 0 12px' }}>
          Pending approval {'\u00b7'} {pendingCards.length}
        </h2>
        {!pending ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : pendingCards.length === 0 ? (
          <div className="empty card card-pad"><h3>All caught up</h3><p className="mt-1">No providers waiting for review.</p></div>
        ) : (
          <div className="card">
            {pendingCards.map((p) => (
              <div key={p.id} className="list-item">
                <div className="avatar" style={{ width: 44, height: 44 }}>{p.businessName?.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.businessName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{p.city || '-'} {'\u2022'} {p.category?.name || 'General'} {'\u2022'} joined {p.createdAt ? formatDate(p.createdAt) : '-'}</div>
                  {p.description && <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 2 }}>{p.description.slice(0, 120)}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { setReview(p); setNote(''); }}>Review</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ fontWeight: 800, fontSize: '1.15rem', margin: '24px 0 12px' }}>Active listings</h2>
        {!all ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : all.filter((p) => p.status !== 'PENDING').length === 0 ? (
          <div className="empty card card-pad"><h3>No providers yet</h3></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Business</th><th>Category</th><th>City</th><th>Services</th><th>Rating</th><th>Status</th></tr></thead>
              <tbody>
                {all.filter((p) => p.status !== 'PENDING').map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.businessName}</strong></td>
                    <td>{p.category?.name || '-'}</td>
                    <td>{p.city || '-'}</td>
                    <td>{p.services?.length || 0}</td>
                    <td>{p.reviewCount ? `${p.rating.toFixed(1)} (${p.reviewCount})` : 'New'}</td>
                    <td><span className={`badge ${p.status === 'VERIFIED' ? 'badge-success' : p.status === 'SUSPENDED' ? 'badge-danger' : 'badge-muted'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {review && (
        <Modal title={review.businessName} onClose={() => setReview(null)} wide>
          <div className="kv">
            <span className="k">Owner</span><span>{review.phone || '-'}</span>
            <span className="k">Location</span><span>{[review.address, review.city, review.state, review.country].filter(Boolean).join(', ') || '-'}</span>
            <span className="k">Website</span><span>{review.website || '-'}</span>
            <span className="k">Services</span><span>{review.services?.length || 0} listed</span>
            <span className="k">Staff</span><span>{review.staff?.length || 0} team members</span>
            <span className="k">Status</span><span>{review.status}</span>
          </div>
          <div className="field mt-3">
            <label>Note to provider</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional message" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button className="btn btn-success" disabled={busy} onClick={() => decide('VERIFIED')}>Approve</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => decide('REJECTED')}>Reject</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
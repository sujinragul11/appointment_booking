import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminUsers() {
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [role, setRole] = useState('');
  const [data, setData] = useState(null);
  const toast = useToast();

  const load = () => {
    api.get('/admin/users', { params: { page, size, role: role || undefined } })
      .then((r) => setData(r.data))
      .catch(() => setData({ content: [], totalElements: 0, totalPages: 0, page, size }));
  };
  useEffect(load, [page, role]);

  const toggle = async (u) => {
    if (!confirm(`${u.active === false ? 'Activate' : 'Deactivate'} ${u.name}?`)) return;
    try {
      const { data: updated } = await api.put(`/admin/users/${u.id}/toggle-active`);
      setData((d) => ({ ...d, content: (d.content || []).map((x) => (x.id === updated.id ? updated : x)) }));
      toast(`${updated.name} is now ${updated.active === false ? 'inactive' : 'active'}`, 'success');
    } catch (e) { toast(getErrorMessage(e), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/admin">Overview</Link>
          <Link to="/dashboard/admin/providers">Providers</Link>
          <Link to="/dashboard/admin/users" className="active">Users</Link>
          <Link to="/dashboard/admin/coupons">Coupons</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Users</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Manage accounts across the platform</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['', 'CUSTOMER', 'PROVIDER', 'ADMIN'].map((r) => (
            <button key={r || 'all'} className={`chip ${role === r ? 'active' : ''}`} onClick={() => { setPage(0); setRole(r); }}>{r || 'All roles'}</button>
          ))}
        </div>

        {!data ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : data.content.length === 0 ? (
          <div className="empty card card-pad"><h3>No users found</h3></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.content.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong><div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{u.email}</div></td>
                    <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-violet' : u.role === 'PROVIDER' ? 'badge-brand' : 'badge-muted'}`}>{u.role}</span></td>
                    <td>{u.phone || '-'}</td>
                    <td>{u.createdAt ? formatDate(u.createdAt) : '-'}</td>
                    <td>{u.active === false ? <span className="badge badge-danger">Inactive</span> : <span className="badge badge-success">Active</span>}</td>
                    <td>
                      {u.role !== 'ADMIN' && (
                        <button className={`btn btn-sm ${u.active === false ? 'btn-success' : 'btn-danger-outline'}`} onClick={() => toggle(u)}>
                          {u.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="pager">
            <button className="btn btn-outline btn-sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>&larr; Prev</button>
            <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Page {page + 1} of {data.totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= data.totalPages - 1} onClick={() => setPage(page + 1)}>Next &rarr;</button>
          </div>
        )}
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDate, formatMoney } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

const EMPTY = { code: '', discountType: 'PERCENT', value: 10, minOrder: 0, maxDiscount: 0, validFrom: '', validTo: '', usageLimit: 0, active: true };

export default function AdminCoupons() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => api.get('/admin/coupons').then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const open = (c) => {
    setEditing(c || null);
    setShowForm(true);
    setForm(c
      ? { code: c.code, discountType: c.discountType, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount, validFrom: c.validFrom || '', validTo: c.validTo || '', usageLimit: c.usageLimit, active: c.active }
      : { ...EMPTY });
  };
  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      code: form.code.toUpperCase(),
      discountType: form.discountType,
      value: Number(form.value),
      minOrder: Number(form.minOrder) || 0,
      maxDiscount: Number(form.maxDiscount) || 0,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      usageLimit: Number(form.usageLimit) || 0,
      active: form.active
    };
    try {
      if (editing) { await api.put(`/admin/coupons/${editing.id}`, payload); toast('Coupon updated', 'success'); }
      else { await api.post('/admin/coupons', payload); toast('Coupon created', 'success'); }
      close();
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save coupon'), 'error'); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this coupon?')) return;
    try { await api.delete(`/admin/coupons/${id}`); toast('Coupon deleted', 'success'); load(); }
    catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/admin">Overview</Link>
          <Link to="/dashboard/admin/providers">Providers</Link>
          <Link to="/dashboard/admin/users">Users</Link>
          <Link to="/dashboard/admin/coupons" className="active">Coupons</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Coupons</h1>
            <p>Discount codes customers can apply</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => open(null)}>New coupon</button>
        </div>

        {!items ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div className="empty card card-pad"><h3>No coupons yet</h3><p className="mt-1">Create promo codes to boost bookings.</p></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td><strong className="grad-text">{c.code}</strong></td>
                    <td>{c.discountType} {c.discountType === 'PERCENT' ? `${c.value}%` : formatMoney(c.value)}{c.maxDiscount ? ` (max ${formatMoney(c.maxDiscount)})` : ''}{c.minOrder ? ` \u00b7 min ${formatMoney(c.minOrder)}` : ''}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{c.validFrom ? `${formatDate(c.validFrom)} \u2192 ${formatDate(c.validTo)}` : 'Always'}</td>
                    <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                    <td>{c.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-muted">Paused</span>}</td>
                    <td><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-outline btn-xs" onClick={() => open(c)}>Edit</button><button className="btn btn-danger-outline btn-xs" onClick={() => remove(c.id)}>Delete</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit coupon' : 'New coupon'} onClose={close}>
          <form onSubmit={save}>
            <div className="field"><label>Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER50" required pattern="[A-Za-z0-9_]+" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Type</label>
                <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                  <option value="PERCENT">Percent off</option>
                  <option value="FLAT">Flat amount</option>
                </select>
              </div>
              <div className="field"><label>Value</label><input type="number" min={0} step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Min order ({'\u20B9'})</label><input type="number" min={0} value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} /></div>
              <div className="field"><label>Max discount ({'\u20B9'})</label><input type="number" min={0} value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Valid from</label><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
              <div className="field"><label>Valid to</label><input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
            </div>
            <div className="field"><label>Usage limit (0 = unlimited)</label><input type="number" min={0} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : (editing ? 'Update' : 'Create coupon')}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
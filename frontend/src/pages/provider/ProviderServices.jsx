import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

const EMPTY = { name: '', description: '', durationMin: 30, bufferMin: 10, price: 0, categoryId: '', imageUrl: '', active: true, staffIds: [] };

export default function ProviderServices() {
  const [services, setServices] = useState(null);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const me = (await api.get('/provider/me')).data;
      setServices(me.services || []);
      setStaff(me.staff || []);
    } catch { setServices([]); }
    try { const r = await api.get('/categories'); setCategories(r.data || []); } catch {}
  };
  useEffect(() => { load(); }, []);

  const open = (s) => {
    setEditing(s || null);
    setShowForm(true);
    setForm(s
      ? { name: s.name, description: s.description || '', durationMin: s.durationMin, bufferMin: s.bufferMin, price: s.price, categoryId: s.categoryId || '', imageUrl: s.imageUrl || '', active: s.active, staffIds: s.staffIds || [] }
      : { ...EMPTY });
  };

  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = { ...form, price: Number(form.price), durationMin: Number(form.durationMin) || 30, bufferMin: Number(form.bufferMin) || 0 };
    if (payload.categoryId) payload.categoryId = Number(payload.categoryId);
    else delete payload.categoryId;
    try {
      if (editing) { await api.put(`/services/${editing.id}`, payload); toast('Service updated', 'success'); }
      else { await api.post('/services', payload); toast('Service added', 'success'); }
      close();
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save service'), 'error'); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Deactivate this service?')) return;
    try { await api.delete(`/services/${id}`); toast('Service deactivated', 'success'); load(); }
    catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services" className="active">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Services</h1>
            <p>What customers can book</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => open(null)}>Add service</button>
        </div>

        {!services ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : services.length === 0 ? (
          <div className="empty card card-pad"><h3>No services yet</h3><p className="mt-1">Add your first service to start taking bookings.</p></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Service</th><th>Duration</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong><div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.categoryName || ''}</div></td>
                    <td>{s.durationMin} min {s.bufferMin ? `+ ${s.bufferMin} buffer` : ''}</td>
                    <td>{formatMoney(s.price)}</td>
                    <td>{s.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-muted">Inactive</span>}</td>
                    <td><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-outline btn-xs" onClick={() => open(s)}>Edit</button><button className="btn btn-danger-outline btn-xs" onClick={() => remove(s.id)}>Off</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit service' : 'Add service'} onClose={close}>
          <form onSubmit={save}>
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="field">
              <label>Category</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">General</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field"><label>Duration (min)</label><input type="number" min={5} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required /></div>
              <div className="field"><label>Buffer (min)</label><input type="number" min={0} value={form.bufferMin} onChange={(e) => setForm({ ...form, bufferMin: e.target.value })} /></div>
              <div className="field"><label>Price ({'\u20B9'})</label><input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
            </div>
            <div className="field">
              <label>Team members who offer this</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {staff.map((st) => (
                  <label key={st.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={(form.staffIds || []).includes(st.id)}
                      onChange={(e) => setForm({ ...form, staffIds: e.target.checked ? [...(form.staffIds || []), st.id] : (form.staffIds || []).filter((x) => x !== st.id) })} />
                    {st.name}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active (bookable)
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : (editing ? 'Update' : 'Add service')}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
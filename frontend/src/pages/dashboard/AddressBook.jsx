import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';

const EMPTY = { label: 'Home', addressLine: '', city: '', state: '', country: '', zip: '', defaultAddress: false };

export default function AddressBook() {
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => api.get('/addresses').then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const open = () => { setShowForm(true); setForm(EMPTY); };
  const close = () => { setShowForm(false); setForm(EMPTY); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = { ...form, defaultAddress: !!form.defaultAddress };
    try {
      await api.post('/addresses', payload);
      toast('Address added', 'success');
      close();
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save address'), 'error'); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this address?')) return;
    try {
      await api.delete(`/addresses/${id}`);
      toast('Address removed', 'success');
      load();
    } catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard">My bookings</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/addresses" className="active">Addresses</Link>
          <Link to="/notifications">Notifications</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Addresses</h1>
            <p>Saved delivery and home addresses</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={open}>Add address</button>
        </div>

        {!items ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div className="empty card card-pad">
            <h3>No saved addresses</h3>
            <p className="mt-1">Add one so booking forms are quicker to fill.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {items.map((a) => (
              <div key={a.id} className="card card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{a.label}</strong>
                  {a.defaultAddress && <span className="badge badge-success">Default</span>}
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 8 }}>
                  {a.addressLine}<br />
                  {[a.city, a.state, a.country, a.zip].filter(Boolean).join(', ')}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-danger-outline btn-sm" onClick={() => remove(a.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="Add address" onClose={close}>
          <form onSubmit={save}>
            <div className="field">
              <label>Label</label>
              <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
                {['Home', 'Work', 'Other'].map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Address line</label>
              <input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="field"><label>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div className="field"><label>PIN code</label><input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.defaultAddress} onChange={(e) => setForm({ ...form, defaultAddress: e.target.checked })} />
              Set as default address
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : 'Add address'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
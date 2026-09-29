import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import Loader from '../../components/Loader';
import { getErrorMessage } from '../../api/client';

export default function ProviderSetting() {
  const [me, setMe] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get('/provider/me').then((r) => {
      setMe(r.data);
      setForm({
        businessName: r.data.businessName || '',
        description: r.data.description || '',
        categoryId: r.data.category?.id || '',
        city: r.data.city || '',
        state: r.data.state || '',
        country: r.data.country || '',
        address: r.data.address || '',
        latitude: r.data.latitude || '',
        longitude: r.data.longitude || '',
        phone: r.data.phone || '',
        website: r.data.website || '',
        logoUrl: r.data.logoUrl || '',
        coverUrl: r.data.coverUrl || '',
        maxAdvanceBookingDays: r.data.maxAdvanceBookingDays || 30,
        cancellationPolicy: r.data.cancellationPolicy || ''
      });
    }).catch(() => {});
    api.get('/categories').then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  if (!me || !form) return <Loader />;

  const set = (k, v) => setForm({ ...form, [k]: v });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        maxAdvanceBookingDays: Number(form.maxAdvanceBookingDays) || 30
      };
      const { data } = await api.put('/provider/me', payload);
      setMe(data);
      toast('Business settings saved', 'success');
    } catch (err) { toast(getErrorMessage(err, 'Could not save settings'), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings" className="active">Settings</Link>
        </nav>
      </aside>

      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Business settings</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>Manage your business listing</p>

        <form className="card card-pad" onSubmit={save} style={{ maxWidth: 720 }}>
          <div className="field"><label>Business name *</label><input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} required /></div>
          <div className="field"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Select a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label>Website</label><input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." /></div>
          <div className="field"><label>Logo URL</label><input value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} /></div>
          <div className="field"><label>Cover URL</label><input value={form.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>City</label><input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
            <div className="field"><label>State</label><input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Country</label><input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
            <div className="field"><label>Address</label><input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Latitude</label><input value={form.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="e.g. 12.9716" /></div>
            <div className="field"><label>Longitude</label><input value={form.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="e.g. 77.5946" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label>Max advance booking (days)</label><input type="number" min={1} value={form.maxAdvanceBookingDays} onChange={(e) => set('maxAdvanceBookingDays', e.target.value)} /></div>
            <div className="field">
              <label>Cancellation policy</label>
              <select value={form.cancellationPolicy} onChange={(e) => set('cancellationPolicy', e.target.value)}>
                <option value="FREE">Free cancellation</option>
                <option value="NOT_ALLOWED">No cancellation</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</button>
        </form>
      </div>
    </div>
  );
}
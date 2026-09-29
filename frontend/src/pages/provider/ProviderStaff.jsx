import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';

const EMPTY = { name: '', designation: '', bio: '', active: true, serviceIds: [] };

export default function ProviderStaff() {
  const [staff, setStaff] = useState(null);
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const me = (await api.get('/provider/me')).data;
      setStaff(me.staff || []);
      setServices(me.services || []);
    } catch { setStaff([]); }
  };
  useEffect(() => { load(); }, []);

  const open = (s) => {
    setEditing(s || null);
    setShowForm(true);
    setForm(s
      ? { name: s.name, designation: s.designation || '', bio: s.bio || '', active: s.active, serviceIds: s.serviceIds || [] }
      : { ...EMPTY });
  };

  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) { await api.put(`/staff/${editing.id}`, form); toast('Staff updated', 'success'); }
      else { await api.post('/staff', form); toast('Team member added', 'success'); }
      close();
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save member'), 'error'); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Deactivate this team member?')) return;
    try { await api.delete(`/staff/${id}`); toast('Member deactivated', 'success'); load(); }
    catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff" className="active">Team</Link>
          <Link to="/dashboard/provider/availability">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Team</h1>
            <p>Staff who deliver your services</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => open(null)}>Add team member</button>
        </div>

        {!staff ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : staff.length === 0 ? (
          <div className="empty card card-pad"><h3>No team members</h3><p className="mt-1">Add staff so customers can pick who they see.</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {staff.map((s) => (
              <div key={s.id} className="card card-pad">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="avatar" style={{ width: 48, height: 48, background: 'var(--gradient-soft)', color: 'var(--brand-700)' }}>{s.name?.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{s.designation || 'Team member'}</div>
                  </div>
                  {s.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-muted">Off</span>}
                </div>
                {s.bio && <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 10 }}>{s.bio}</p>}
                {(s.serviceIds || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {services.filter((sv) => s.serviceIds.includes(sv.id)).map((sv) => <span key={sv.id} className="chip">{sv.name}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => open(s)}>Edit</button>
                  <button className="btn btn-danger-outline btn-sm" onClick={() => remove(s.id)}>Deactivate</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit team member' : 'Add team member'} onClose={close}>
          <form onSubmit={save}>
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Designation</label><input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior stylist" /></div>
            <div className="field"><label>Bio</label><textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
            <div className="field">
              <label>Offers services</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {services.map((sv) => (
                  <label key={sv.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={(form.serviceIds || []).includes(sv.id)}
                      onChange={(e) => setForm({ ...form, serviceIds: e.target.checked ? [...(form.serviceIds || []), sv.id] : (form.serviceIds || []).filter((x) => x !== sv.id) })} />
                    {sv.name}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : (editing ? 'Update' : 'Add member')}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
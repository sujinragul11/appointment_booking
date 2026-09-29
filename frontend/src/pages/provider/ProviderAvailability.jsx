import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatTime, todayISO } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

const DAYS = ['-', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ProviderAvailability() {
  const [bundle, setBundle] = useState(null);
  const [providerId, setProviderId] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: 1, startTime: '09:00', endTime: '18:00', staffId: '', active: true });
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ date: todayISO(), startTime: '09:00', endTime: '18:00', isAvailable: true, reason: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const me = (await api.get('/provider/me')).data;
      setProviderId(me.id);
      const b = (await api.get(`/availability/${me.id}`)).data;
      setBundle(b);
      try { const st = (await api.get(`/staff/provider/${me.id}`)).data; setStaffList(st || []); } catch {}
    } catch { setBundle(null); }
  };
  useEffect(() => { load(); }, []);

  const saveSlot = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/availability', {
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime + ':00',
        endTime: form.endTime + ':00',
        staffId: form.staffId ? Number(form.staffId) : null,
        active: form.active
      });
      toast('Availability saved', 'success');
      setShowForm(false);
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save availability'), 'error'); } finally { setBusy(false); }
  };

  const addOverride = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/availability/override', {
        date: overrideForm.date,
        startTime: overrideForm.isAvailable ? overrideForm.startTime + ':00' : null,
        endTime: overrideForm.isAvailable ? overrideForm.endTime + ':00' : null,
        isAvailable: overrideForm.isAvailable,
        reason: overrideForm.reason || null
      });
      toast('Override saved', 'success');
      setShowOverride(false);
      load();
    } catch (err) { toast(getErrorMessage(err, 'Could not save override'), 'error'); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this weekly slot?')) return;
    try { await api.delete(`/availability/${id}`); toast('Deleted', 'success'); load(); }
    catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  const removeOverride = async (id) => {
    try { await api.delete(`/availability/override/${id}`); toast('Override removed', 'success'); load(); }
    catch (err) { toast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <nav className="dash-nav">
          <Link to="/dashboard/provider">Overview</Link>
          <Link to="/dashboard/provider/appointments">Appointments</Link>
          <Link to="/dashboard/provider/services">Services</Link>
          <Link to="/dashboard/provider/staff">Team</Link>
          <Link to="/dashboard/provider/availability" className="active">Availability</Link>
          <Link to="/dashboard/provider/earnings">Earnings</Link>
          <Link to="/dashboard/provider/settings">Settings</Link>
        </nav>
      </aside>

      <div>
        <div className="section-title">
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Availability</h1>
            <p>Your weekly working hours</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowOverride(true)}>Date override</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Add slot</button>
          </div>
        </div>

        {!bundle ? (
          <p style={{ color: 'var(--muted)' }}>Loading...</p>
        ) : bundle.availability.length === 0 ? (
          <div className="empty card card-pad">
            <h3>No working hours set</h3>
            <p className="mt-1">Add your weekly slots so customers can see when you're available.</p>
            <button className="btn btn-primary mt-3" onClick={() => setShowForm(true)}>Add first slot</button>
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Day</th><th>Open</th><th>Close</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {[...bundle.availability].sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.dayName}</strong>{a.staffId ? <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>staff #{a.staffId}</div> : <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>everyone</div>}</td>
                    <td>{formatTime(a.startTime)}</td>
                    <td>{formatTime(a.endTime)}</td>
                    <td>{a.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-muted">Closed</span>}</td>
                    <td><button className="btn btn-danger-outline btn-xs" onClick={() => remove(a.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ fontWeight: 800, fontSize: '1.15rem', margin: '26px 0 12px' }}>Date overrides</h2>
        {!bundle || bundle.overrides.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No date-specific changes.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {bundle.overrides.map((o) => (
              <div key={o.id} className="card card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{o.date}{o.reason ? ` \u00b7 ${o.reason}` : ''}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {o.available ? `Open ${formatTime(o.startTime)} - ${formatTime(o.endTime)}` : 'Closed'}
                    </div>
                  </div>
                  <span className={`badge ${o.available ? 'badge-success' : 'badge-danger'}`}>{o.available ? 'Open' : 'Closed'}</span>
                </div>
                <button className="btn btn-danger-outline btn-xs mt-2" onClick={() => removeOverride(o.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="Add weekly slot" onClose={() => setShowForm(false)}>
          <form onSubmit={saveSlot}>
            <div className="field">
              <label>Day</label>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                {DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label>Open</label><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></div>
              <div className="field"><label>Close</label><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></div>
            </div>
            <div className="field">
              <label>Applies to</label>
              <select value={String(form.staffId)} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                <option value="">Everyone</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : 'Save slot'}</button>
          </form>
        </Modal>
      )}

      {showOverride && (
        <Modal title="Date override" onClose={() => setShowOverride(false)}>
          <form onSubmit={addOverride}>
            <div className="field"><label htmlFor="ov-date">Date</label><input id="ov-date" type="date" min={todayISO()} value={overrideForm.date} onChange={(e) => setOverrideForm({ ...overrideForm, date: e.target.value })} required /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={overrideForm.isAvailable} onChange={(e) => setOverrideForm({ ...overrideForm, isAvailable: e.target.checked })} />
              Open for bookings on this day
            </label>
            {overrideForm.isAvailable && (
              <div className="form-grid">
                <div className="field"><label>From</label><input type="time" value={overrideForm.startTime} onChange={(e) => setOverrideForm({ ...overrideForm, startTime: e.target.value })} required /></div>
                <div className="field"><label>To</label><input type="time" value={overrideForm.endTime} onChange={(e) => setOverrideForm({ ...overrideForm, endTime: e.target.value })} required /></div>
              </div>
            )}
            <div className="field"><label>Reason (optional)</label><input value={overrideForm.reason} onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })} /></div>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving...' : 'Save override'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { initials } from '../utils/format';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    api.get('/notifications/unread-count')
      .then((r) => setUnread(r.data.unread))
      .catch(() => {});
  }, [user]);

  const go = (fn) => () => { setOpen(false); fn(); };

  const links = [
    { to: '/providers', label: 'Browse' },
    { to: '/categories', label: 'Categories' }
  ];
  if (user?.role === 'PROVIDER') links.push({ to: '/dashboard/provider', label: 'Dashboard' });
  if (user?.role === 'ADMIN') links.push({ to: '/dashboard/admin', label: 'Admin' });
  if (user?.role === 'CUSTOMER') links.push({ to: '/dashboard', label: 'My Bookings' });

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="logo" onClick={() => setOpen(false)}>
          <span className="logo-mark">S</span> Sloto
        </Link>

        <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? '\u2715' : '\u2630'}
        </button>

        <ul className={`nav-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setOpen(false)}>
                {l.label}
              </NavLink>
            </li>
          ))}
          <li className="nav-actions">
            {user ? (
              <div className="nav-user">
                <Link to="/notifications" className="bell-wrap" onClick={() => setOpen(false)} aria-label="Notifications">
                  &#128276;
                  {unread > 0 && <span className="bell-count">{unread}</span>}
                </Link>
                <Link to="/profile" className="avatar" onClick={() => setOpen(false)}>
                  {user.photoUrl ? <img src={user.photoUrl} alt="" /> : initials(user.name)}
                </Link>
                <button className="btn btn-ghost btn-sm" onClick={go(() => { logout(); navigate('/'); })}>Logout</button>
              </div>
            ) : (
              <div className="nav-user">
                <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
                <Link to="/register" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Get started</Link>
              </div>
            )}
          </li>
        </ul>
      </div>
    </header>
  );
}
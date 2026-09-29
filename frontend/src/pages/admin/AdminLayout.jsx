import AdminNav from '../../components/AdminNav';

/** Shell of every admin page: sidebar, the page's <h1> with a short description, and header actions. */
export default function AdminLayout({ title, subtitle, actions, children }) {
  return (
    <div className="dash admin-dash">
      <AdminNav />
      <div className="admin-main">
        <header className="admin-head">
          <div className="admin-head-text">
            <h1 className="admin-title">{title}</h1>
            {subtitle ? <p className="admin-sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="admin-head-actions">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

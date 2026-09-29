export default function NotFound() {
  return (
    <div className="container page" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '6rem', fontWeight: 800, background: 'var(--gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>404</div>
      <h2 className="mt-2">Page not found</h2>
      <p style={{ color: 'var(--muted)', margin: '10px 0 24px' }}>The page you're looking for doesn't exist.</p>
      <a className="btn btn-primary" href="/">Back to home</a>
    </div>
  );
}
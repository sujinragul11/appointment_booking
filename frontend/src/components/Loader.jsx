export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="loader-screen" role="status">
      <div className="loader-box">
        <span className="spinner dark" style={{ display: 'inline-block', alignSelf: 'center' }} aria-hidden="true" />
        <p className="mt-2">{label}</p>
      </div>
    </div>
  );
}

// Inline spinner: a <span> so it is valid inside buttons and paragraphs.
export function InlineLoader({ label = 'Loading' }) {
  return (
    <>
      <span className="spinner dark" style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: 'middle' }} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}

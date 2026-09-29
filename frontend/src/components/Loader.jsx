export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="loader-screen">
      <div className="loader-box">
        <div className="spinner dark" style={{ display: 'inline-block', alignSelf: 'center' }} />
        <p className="mt-2">{label}</p>
      </div>
    </div>
  );
}

export function InlineLoader() {
  return <div className="spinner dark" style={{ display: 'inline-block', width: 16, height: 16 }} />;
}
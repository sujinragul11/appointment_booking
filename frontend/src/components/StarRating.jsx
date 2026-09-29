export default function StarRating({ value = 0, size = '0.95rem' }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= Math.round(value) ? '#f59e0b' : '#e2e8f0' }}>&#9733;</span>
      ))}
    </span>
  );
}
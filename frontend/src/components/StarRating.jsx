import { useT } from '../i18n';

/** Read-only star rating; screen readers hear "4 out of 5 stars". */
export default function StarRating({ value = 0, size = '0.95rem' }) {
  const t = useT();
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={t('site.rating.stars', { value: Number(value) || 0 })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={i <= rounded ? 'star-on' : 'star-off'}>&#9733;</span>
      ))}
    </span>
  );
}

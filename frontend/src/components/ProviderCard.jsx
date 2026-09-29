import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { formatMoney } from '../utils/format';
import { tp } from '../utils/plural';

/** Price range of a provider's active services: "₹300 – ₹3,000", or one price. */
export function priceRange(min, max) {
  if (min == null && max == null) return '';
  if (min == null || max == null || Number(min) === Number(max)) return formatMoney(min ?? max);
  return `${formatMoney(min)} – ${formatMoney(max)}`;
}

/** Search result card (FR-19): rating, reviews, price range, city and specialty. */
export default function ProviderCard({ p, headingLevel = 3 }) {
  const t = useT();
  const Heading = `h${headingLevel}`;
  const icon = p.category?.icon || '✦';
  const rating = Number(p.rating || 0);
  const prices = priceRange(p.minPrice, p.maxPrice);
  const where = [p.city, p.country].filter(Boolean).join(', ');

  return (
    <Link to={`/providers/${p.id}`} className="card card-hover provider-card">
      <div className="provider-cover">
        {p.coverUrl && <img src={p.coverUrl} alt="" loading="lazy" />}
      </div>
      <div className="provider-logo-wrap">
        <div className="provider-logo" aria-hidden="true">
          {p.logoUrl ? <img src={p.logoUrl} alt="" loading="lazy" /> : <span>{icon}</span>}
        </div>
      </div>
      <div className="provider-card-body">
        <div>
          <Heading className="provider-card-title">{p.businessName}</Heading>
          {(p.specialty || p.category?.name) && <p className="provider-specialty">{p.specialty || p.category?.name}</p>}
          <div className="meta mt-1">
            {p.reviewCount > 0 ? (
              <span className="rating-pill">
                <span aria-hidden="true">&#9733;</span> {rating.toFixed(1)}
                <span className="sr-only"> {t('site.rating.outOf5')}</span>
              </span>
            ) : (
              <span className="badge badge-gray">{t('site.rating.new')}</span>
            )}
            <span>{tp(t, 'site.rating.reviews', { count: p.reviewCount || 0 })}</span>
            {where && <><span aria-hidden="true">{'•'}</span><span>{where}</span></>}
          </div>
        </div>
        {p.description && <p className="provider-desc">{p.description.length > 110 ? `${p.description.slice(0, 110)}…` : p.description}</p>}
        <div className="meta provider-card-foot">
          {prices ? <span className="price-range">{prices}</span> : <span>{t('site.providers.noPrices')}</span>}
          <span className="provider-cta">{t('common.bookNow')} <span aria-hidden="true">&rarr;</span></span>
        </div>
      </div>
    </Link>
  );
}

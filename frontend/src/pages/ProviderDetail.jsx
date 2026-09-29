import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loader, { InlineLoader } from '../components/Loader';
import Modal from '../components/Modal';
import StarRating from '../components/StarRating';
import ModeBadge from '../components/ModeBadge';
import { useI18n } from '../i18n';
import { formatMoney, initials, isValidTimeZone, timeZoneLabel } from '../utils/format';
import { formatClock, formatDay, todayInZone } from '../utils/bookingCalendar';
import { tp } from '../utils/plural';

const isActive = (x) => x && x.active !== false;
const WEEK = [1, 2, 3, 4, 5, 6, 7];
// 1 Jan 2024 was a Monday: day n of the ISO week is 31 Dec 2023 + n.
const weekdayName = (dow, locale) => new Date(2023, 11, 31 + dow).toLocaleDateString(locale, { weekday: 'long' });

function Hours({ bundle, tz, t, locale }) {
  const windows = (bundle?.availability || []).filter((a) => isActive(a) && a.staffId == null);
  const byDay = WEEK.map((d) => ({
    dow: d,
    windows: windows.filter((w) => Number(w.dayOfWeek) === d).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
  }));
  const today = todayInZone(tz);
  const changes = (bundle?.blockedDates || [])
    .filter((b) => b.staffId == null && String(b.date) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6);

  if (!bundle) return <p className="muted-line">{t('site.provider.hoursUnavailable')}</p>;
  if (windows.length === 0 && changes.length === 0) return <p className="muted-line">{t('site.provider.noHours')}</p>;

  return (
    <>
      <table className="hours-table">
        <caption className="sr-only">{t('site.provider.hoursTitle')}</caption>
        <tbody>
          {byDay.map(({ dow, windows: ws }) => (
            <tr key={dow}>
              <th scope="row">{weekdayName(dow, locale)}</th>
              <td>
                {ws.length === 0 ? <span className="closed-text">{t('site.provider.closed')}</span>
                  : ws.map((w) => `${formatClock(w.startTime, locale)} – ${formatClock(w.endTime, locale)}`).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {changes.length > 0 && (
        <div className="mt-2">
          <h3 className="side-subtitle">{t('site.provider.specialDates')}</h3>
          <ul className="plain-list special-dates">
            {changes.map((b) => (
              <li key={b.id ?? `${b.date}-${b.startTime}`}>
                <span className="special-date">{formatDay(String(b.date), locale)}</span>{' '}
                {!b.available && !b.startTime && t('site.provider.closedAllDay')}
                {!b.available && b.startTime && t('site.provider.closedBetween', { from: formatClock(b.startTime, locale), to: formatClock(b.endTime, locale) })}
                {b.available && b.startTime && t('site.provider.specialHours', { from: formatClock(b.startTime, locale), to: formatClock(b.endTime, locale) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Policy({ policy, t }) {
  if (!policy) return null;
  const notice = Number(policy.minNoticeMin || 0);
  const noticeText = notice >= 60 && notice % 60 === 0
    ? tp(t, 'site.provider.policy.noticeHours', { count: notice / 60 }) : tp(t, 'site.provider.policy.noticeMinutes', { count: notice });
  return (
    <>
      {policy.cancellationPolicy && <p className="policy-text">{policy.cancellationPolicy}</p>}
      <ul className="policy-list">
        <li>{t('site.provider.policy.freeCancel', { hours: policy.cancellationCutoffHours })}</li>
        <li>{t('site.provider.policy.lateRefund', { pct: policy.lateCancelRefundPercent })}</li>
        <li>{policy.maxReschedules > 0
          ? tp(t, 'site.provider.policy.reschedule', { count: policy.maxReschedules, hours: policy.rescheduleCutoffHours })
          : t('site.provider.policy.noReschedule')}</li>
        <li>{t('site.provider.policy.advance', { days: policy.maxAdvanceBookingDays })}</li>
        {notice > 0 && <li>{noticeText}</li>}
        <li>{policy.autoConfirm ? t('site.provider.policy.autoConfirm') : t('site.provider.policy.manualConfirm')}</li>
      </ul>
    </>
  );
}

export default function ProviderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [provider, setProvider] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [bundle, setBundle] = useState(undefined);
  const [attempt, setAttempt] = useState(0);
  const [reporting, setReporting] = useState(null);
  const [reason, setReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reported, setReported] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    setProvider(null);
    setLoadError(null);
    api.get(`/providers/${id}`)
      .then((r) => { if (active) setProvider(r.data); })
      .catch((e) => { if (active) setLoadError({ status: e?.response?.status, message: getErrorMessage(e) }); });
    api.get(`/providers/${id}/reviews`)
      .then((r) => { if (active) setReviews(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (active) setReviews([]); });
    api.get(`/providers/${id}/availability`)
      .then((r) => { if (active) setBundle(r.data); })
      .catch(() => { if (active) setBundle(null); });
    return () => { active = false; };
  }, [id, attempt]);

  const services = useMemo(() => (provider?.services || []).filter(isActive), [provider]);
  const staff = useMemo(() => (provider?.staff || []).filter(isActive), [provider]);

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reporting) return;
    setReportBusy(true);
    try {
      const { data } = await api.post(`/reviews/${reporting.id}/flag`, { reason: reason.trim() || null });
      setReported((prev) => new Set(prev).add(reporting.id));
      toast(data?.message || t('site.reviews.reported'), 'success');
      setReporting(null);
      setReason('');
    } catch (err) {
      toast(getErrorMessage(err, t('site.reviews.reportFailed')), 'error');
    } finally {
      setReportBusy(false);
    }
  };

  if (loadError) {
    const missing = loadError.status === 404;
    return (
      <div className="container page">
        <div className="empty card card-pad">
          <h1 className="empty-title">{missing ? t('site.provider.notFound') : t('site.provider.loadFailed')}</h1>
          <p className="mt-1">{missing ? t('site.provider.notFoundText') : loadError.message}</p>
          <div className="btn-row center-row mt-3">
            {!missing && <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button>}
            <Link className="btn btn-outline" to="/providers">{t('site.nav.providers')}</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!provider) return <Loader label={t('common.loading')} />;

  const tz = isValidTimeZone(provider.timezone) ? provider.timezone : null;
  const branches = provider.branches || [];
  const address = [provider.address, provider.city, provider.state, provider.country].filter(Boolean).join(', ');
  const rating = Number(provider.rating || 0);

  return (
    <div className="container page">
      <Link to="/providers" className="link-more back-link"><span aria-hidden="true">&larr;</span> {t('site.provider.back')}</Link>

      <header className="card mt-2 provider-hero">
        <div className="provider-cover provider-cover-lg">
          {provider.coverUrl && <img src={provider.coverUrl} alt="" />}
        </div>
        <div className="card-pad provider-hero-body">
          <div className="provider-logo provider-logo-lg">
            {provider.logoUrl
              ? <img src={provider.logoUrl} alt={t('site.provider.logoAlt', { name: provider.businessName })} />
              : <span aria-hidden="true">{provider.category?.icon || '✦'}</span>}
          </div>
          <div className="provider-hero-row">
            <div className="provider-hero-text">
              <h1 className="provider-name">{provider.businessName}</h1>
              {(provider.specialty || provider.category) && (
                <p className="provider-specialty">
                  {provider.specialty}
                  {provider.specialty && provider.category ? ' · ' : ''}
                  {provider.category?.name}
                </p>
              )}
              <div className="provider-meta">
                {provider.reviewCount > 0 ? (
                  <span className="rating-pill">
                    <span aria-hidden="true">&#9733;</span> {rating.toFixed(1)}<span className="sr-only"> {t('site.rating.outOf5')}</span>
                  </span>
                ) : <span className="badge badge-gray">{t('site.rating.new')}</span>}
                <a href="#reviews">{tp(t, 'site.rating.reviews', { count: provider.reviewCount || 0 })}</a>
                {address && <span>{address}</span>}
              </div>
              <div className="provider-meta">
                {provider.phone && <a href={`tel:${provider.phone}`}>{provider.phone}</a>}
                {provider.website && (
                  <a href={/^https?:\/\//i.test(provider.website) ? provider.website : `https://${provider.website}`} target="_blank" rel="noopener noreferrer">
                    {provider.website}<span className="sr-only"> {t('site.common.opensNewTab')}</span>
                  </a>
                )}
              </div>
              {tz && <p className="tz-note">{t('site.provider.timesIn', { zone: timeZoneLabel(tz), tz })}</p>}
            </div>
            {services.length > 0 && (
              <Link className="btn btn-primary btn-lg" to={`/book/${provider.id}/${services[0].id}`}>{t('common.bookNow')}</Link>
            )}
          </div>
        </div>
      </header>

      <div className="detail-grid mt-4">
        <div className="detail-main">
          <section className="card card-pad" aria-labelledby="pd-services">
            <h2 id="pd-services" className="section-h">{t('site.provider.services')}</h2>
            {services.length === 0 ? (
              <p className="muted-line">{t('site.provider.noServices')}</p>
            ) : (
              <ul className="plain-list">
                {services.map((s) => (
                  <li key={s.id} className="service-row">
                    <div className="service-row-main">
                      <h3 className="service-row-name">{s.name}</h3>
                      {s.description && <p className="service-row-desc">{s.description}</p>}
                      <div className="service-row-meta">
                        <span>{t('site.services.duration', { min: s.durationMin })}</span>
                        <ModeBadge mode={s.mode} />
                        {s.depositPercent > 0 && s.depositPercent < 100 && (
                          <span className="badge badge-amber">{t('site.services.deposit', { pct: s.depositPercent })}</span>
                        )}
                        {(s.staffNames || []).length > 0 && <span>{t('site.provider.with', { names: s.staffNames.join(', ') })}</span>}
                      </div>
                    </div>
                    <div className="service-row-side">
                      <strong className="service-price">{formatMoney(s.price)}</strong>
                      <Link className="btn btn-outline btn-sm" to={`/book/${provider.id}/${s.id}`}
                        aria-label={t('site.services.bookAria', { name: s.name, provider: provider.businessName })}>
                        {t('site.services.book')}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {provider.description && (
            <section className="card card-pad" aria-labelledby="pd-about">
              <h2 id="pd-about" className="section-h">{t('site.provider.about')}</h2>
              <p className="about-text">{provider.description}</p>
            </section>
          )}

          {staff.length > 0 && (
            <section className="card card-pad" aria-labelledby="pd-team">
              <h2 id="pd-team" className="section-h">{t('site.provider.team')}</h2>
              <ul className="team-grid plain-grid">
                {staff.map((s) => (
                  <li key={s.id} className="team-card">
                    <div className="avatar team-avatar" aria-hidden="true">
                      {s.photoUrl ? <img src={s.photoUrl} alt="" /> : initials(s.name)}
                    </div>
                    <h3 className="team-name">{s.name}</h3>
                    {s.designation && <p className="team-role">{s.designation}</p>}
                    {s.bio && <p className="team-bio">{s.bio}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(branches.length > 0 || address) && (
            <section className="card card-pad" aria-labelledby="pd-locations">
              <h2 id="pd-locations" className="section-h">{t('site.provider.locations')}</h2>
              <ul className="plain-list">
                {branches.length === 0 && address && <li className="location-row">{address}</li>}
                {branches.map((b) => (
                  <li key={b.id} className="location-row">
                    <strong>{b.name}</strong>{b.main && <span className="badge badge-primary">{t('site.provider.mainBranch')}</span>}
                    <div className="location-address">{[b.address, b.city, b.state, b.country].filter(Boolean).join(', ')}</div>
                    {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card card-pad" aria-labelledby="reviews" id="reviews-section">
            <h2 id="reviews" className="section-h" tabIndex={-1}>{t('site.reviews.title')}</h2>
            {provider.reviewCount > 0 && (
              <p className="review-summary">
                <StarRating value={rating} /> <strong>{rating.toFixed(1)}</strong>
                <span className="muted"> · {tp(t, 'site.rating.reviews', { count: provider.reviewCount })}</span>
              </p>
            )}
            {reviews === null ? (
              <p className="muted-line"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
            ) : reviews.length === 0 ? (
              <p className="muted-line">{t('site.reviews.none')}</p>
            ) : (
              <ul className="plain-list review-list">
                {reviews.map((r) => (
                  <li key={r.id} className="review-item">
                    <div className="avatar-row">
                      <div className="avatar review-avatar" aria-hidden="true">
                        {r.customerPhoto ? <img src={r.customerPhoto} alt="" /> : initials(r.customerName)}
                      </div>
                      <div>
                        <div className="nm">{r.customerName}</div>
                        <StarRating value={r.rating} size="0.85rem" />
                      </div>
                      <span className="review-date">{r.createdAt ? formatDay(String(r.createdAt).slice(0, 10), locale) : ''}</span>
                    </div>
                    {r.comment && <p className="review-comment">{r.comment}</p>}
                    {r.reply && (
                      <div className="review-reply">
                        <strong>{t('site.reviews.reply', { name: provider.businessName })}</strong> {r.reply}
                      </div>
                    )}
                    {user && user.id !== r.customerId && (
                      <button type="button" className="btn btn-ghost btn-xs review-report" disabled={reported.has(r.id)}
                        onClick={() => { setReporting(r); setReason(''); }}
                        aria-label={reported.has(r.id) ? t('site.reviews.reportedShort') : t('site.reviews.reportAria', { name: r.customerName })}>
                        {reported.has(r.id) ? t('site.reviews.reportedShort') : t('site.reviews.report')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="detail-side" aria-label={t('site.provider.sidebar')}>
          <section className="card card-pad" aria-labelledby="pd-hours">
            <h2 id="pd-hours" className="side-title">{t('site.provider.hoursTitle')}</h2>
            {tz && <p className="tz-note">{t('site.provider.timesIn', { zone: timeZoneLabel(tz), tz })}</p>}
            {bundle === undefined ? <p className="muted-line"><InlineLoader label={t('common.loading')} /></p>
              : <Hours bundle={bundle} tz={tz} t={t} locale={locale} />}
          </section>

          <section className="card card-pad" aria-labelledby="pd-policy">
            <h2 id="pd-policy" className="side-title">{t('site.provider.policyTitle')}</h2>
            <Policy policy={provider.policy} t={t} />
          </section>

          {services.length > 0 ? (
            <Link className="btn btn-primary btn-lg btn-block" to={`/book/${provider.id}/${services[0].id}`}>{t('site.provider.bookCta')}</Link>
          ) : (
            <p className="form-note">{t('site.provider.noOnlineBooking')}</p>
          )}
        </aside>
      </div>

      {reporting && (
        <Modal title={t('site.reviews.reportTitle')} onClose={() => setReporting(null)} closeDisabled={reportBusy}>
          <form onSubmit={submitReport}>
            <p className="hint mb-2">{t('site.reviews.reportText')}</p>
            <div className="field">
              <label htmlFor="report-reason">{t('site.reviews.reason')} <span className="optional">({t('common.optional')})</span></label>
              <textarea id="report-reason" rows={3} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
              <span className="hint">{tp(t, 'site.common.charsLeft', { count: 255 - reason.length })}</span>
            </div>
            <button type="submit" className="btn btn-danger btn-block" disabled={reportBusy}>
              {reportBusy ? <InlineLoader label={t('site.reviews.reporting')} /> : t('site.reviews.reportSubmit')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

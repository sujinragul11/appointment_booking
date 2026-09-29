import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getErrorMessage } from '../api/client';
import { downloadIcs, downloadInvoice } from '../api/site';
import StatusBadge from '../components/StatusBadge';
import ModeBadge from '../components/ModeBadge';
import Loader, { InlineLoader } from '../components/Loader';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMoney, isValidTimeZone } from '../utils/format';
import { formatWhen, viewerClock } from '../utils/bookingCalendar';

/** FR-23: booking confirmation with reference, time (with zone), calendar invite and invoice. */
export default function BookSuccess() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [appt, setAppt] = useState(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState('');
  const headingRef = useRef(null);

  useEffect(() => {
    api.get(`/appointments/${id}`).then((r) => setAppt(r.data)).catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    if (appt) headingRef.current?.focus();
  }, [appt]);

  const download = async (kind) => {
    setDownloading(kind);
    try {
      if (kind === 'ics') await downloadIcs(appt.id, appt.bookingRef);
      else await downloadInvoice(appt.id, appt.bookingRef);
    } catch (e) {
      toast(getErrorMessage(e, t('site.appointment.downloadFailed')), 'error');
    } finally {
      setDownloading('');
    }
  };

  if (failed) {
    return (
      <div className="container page narrow-page">
        <div className="empty card card-pad">
          <h1 className="empty-title">{t('site.success.savedTitle')}</h1>
          <p className="mt-1">{t('site.success.savedText')}</p>
          <Link className="btn btn-primary mt-3" to="/dashboard">{t('site.success.myBookings')}</Link>
        </div>
      </div>
    );
  }
  if (!appt) return <Loader label={t('common.loading')} />;

  const tz = isValidTimeZone(appt.timezone) ? appt.timezone : null;
  const local = viewerClock(appt.startAt, tz, locale);
  const pending = appt.status === 'PENDING';
  const payment = appt.payment || {};
  const paidOnline = payment.method === 'RAZORPAY' && ['SUCCESS', 'PARTIALLY_REFUNDED'].includes(payment.status);

  return (
    <div className="container page narrow-page">
      <div className="card card-pad success-card">
        <div className={`success-ico ${pending ? 'pending' : ''}`} aria-hidden="true">{pending ? '⏳' : '✓'}</div>
        <h1 ref={headingRef} tabIndex={-1} className="success-title">
          {pending ? t('site.success.pendingTitle') : t('site.success.title')}
        </h1>
        <p className="page-lead">{pending ? t('site.success.pendingText') : t('site.success.text')}</p>

        <div className="ref-box">
          <span className="ref-label">{t('site.appointment.reference')}</span>
          <strong className="ref-value">{appt.bookingRef}</strong>
        </div>

        <dl className="kv success-kv">
          <dt className="k">{t('site.booking.service')}</dt><dd>{appt.serviceName}</dd>
          <dt className="k">{t('site.appointment.provider')}</dt><dd><Link to={`/providers/${appt.providerId}`}>{appt.providerName}</Link></dd>
          <dt className="k">{t('site.booking.when')}</dt>
          <dd>
            {formatWhen(appt, locale)}
            {local && <span className="tz-note block">{t('site.slots.yourTime', { time: local })}</span>}
          </dd>
          {appt.staffName && <><dt className="k">{t('site.booking.staff')}</dt><dd>{appt.staffName}</dd></>}
          <dt className="k">{t('site.booking.format')}</dt><dd><ModeBadge mode={appt.mode} /></dd>
          {appt.mode === 'ONLINE' && appt.meetingLink && (
            <>
              <dt className="k">{t('site.appointment.meeting')}</dt>
              <dd><a href={appt.meetingLink} target="_blank" rel="noopener noreferrer" className="break-all">
                {t('site.appointment.joinMeeting')}<span className="sr-only"> {t('site.common.opensNewTab')}</span>
              </a></dd>
            </>
          )}
          {appt.mode !== 'ONLINE' && appt.providerAddress && (
            <><dt className="k">{t('site.appointment.location')}</dt><dd>{appt.providerAddress}</dd></>
          )}
          <dt className="k">{t('site.appointment.status')}</dt><dd><StatusBadge status={appt.status} /></dd>
          <dt className="k">{t('site.appointment.payment')}</dt>
          <dd>
            <StatusBadge status={payment.method} /> <StatusBadge status={appt.paymentStatus || payment.status} />
          </dd>
          <dt className="k">{t('site.booking.total')}</dt>
          <dd>{formatMoney(appt.finalAmount)}{appt.couponCode ? ` (${appt.couponCode})` : ''}</dd>
          {paidOnline && <><dt className="k">{t('site.appointment.paid')}</dt><dd>{formatMoney(payment.amount)}</dd></>}
          {payment.balanceDue > 0 && <><dt className="k">{t('site.appointment.balanceDue')}</dt><dd>{formatMoney(payment.balanceDue)}</dd></>}
        </dl>

        <div className="btn-row center-row mt-3">
          <button type="button" className="btn btn-outline" onClick={() => download('ics')} disabled={downloading === 'ics'}>
            {downloading === 'ics' ? <InlineLoader label={t('site.appointment.downloading')} /> : <><span aria-hidden="true">{'\u{1F4C5}'}</span> {t('site.appointment.addToCalendar')}</>}
          </button>
          {payment.invoiceNumber && (
            <button type="button" className="btn btn-outline" onClick={() => download('invoice')} disabled={downloading === 'invoice'}>
              {downloading === 'invoice' ? <InlineLoader label={t('site.appointment.downloading')} /> : t('site.appointment.invoice')}
            </button>
          )}
          <Link className="btn btn-primary" to={`/appointments/${appt.id}`}>{t('site.success.viewBooking')}</Link>
        </div>
        <p className="mt-2 center"><Link to="/dashboard">{t('site.success.myBookings')}</Link></p>
      </div>
    </div>
  );
}

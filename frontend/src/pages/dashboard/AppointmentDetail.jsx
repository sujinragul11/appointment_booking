import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import { downloadIcs, downloadInvoice } from '../../api/site';
import { useAuth } from '../../context/AuthContext';
import StatusBadge, { useStatusLabel } from '../../components/StatusBadge';
import ModeBadge from '../../components/ModeBadge';
import AccountNav from '../../components/AccountNav';
import Countdown from '../../components/Countdown';
import Loader, { InlineLoader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { usePayment } from '../../components/PaymentDialog';
import { useI18n } from '../../i18n';
import { formatMoney, isValidTimeZone } from '../../utils/format';
import { formatInstant, formatStamp, formatWhen, viewerClock } from '../../utils/bookingCalendar';
import { localDeadline } from '../../utils/countdown';
import CancelDialog from './appointment/CancelDialog';
import RescheduleDialog from './appointment/RescheduleDialog';
import ReviewDialog from './appointment/ReviewDialog';
import ConfirmDialog from './appointment/ConfirmDialog';
import { tp } from '../../utils/plural';

const NOTES_MAX = 5000;
const PAID = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/** Where "Back" goes for each role. */
export function backPathFor(role) {
  if (role === 'PROVIDER') return '/dashboard/provider/appointments';
  if (role === 'STAFF') return '/dashboard/staff';
  if (role === 'ADMIN') return '/dashboard/admin';
  return '/dashboard';
}

/**
 * One appointment, shared by customers, providers, staff and admins. Which buttons appear is
 * decided by the server (`actions`), never re-derived here; the server enforces the same rules.
 */
export default function AppointmentDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const statusLabel = useStatusLabel();
  const toast = useToast();

  const [appt, setAppt] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [payDeadline, setPayDeadline] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [dialog, setDialog] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [statusBusy, setStatusBusy] = useState('');

  // A notice handed over by the booking flow is shown once, not again after a reload.
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((data, serverDate) => {
    setAppt(data);
    setPayDeadline(data?.paymentDueAt ? localDeadline(data.paymentDueAt, serverDate) : null);
  }, []);

  const load = useCallback(() => api.get(`/appointments/${id}`)
    .then((r) => { apply(r.data, r.headers?.date); setLoadError(''); })
    .catch((e) => setLoadError(getErrorMessage(e, t('site.appointment.loadFailed')))), [id, apply, t]);
  useEffect(() => { load(); }, [load]);

  const payment = usePayment({
    onPaid: () => { toast(t('site.payment.success'), 'success'); setNotice(''); load(); },
    onDismiss: () => { setNotice(t('site.payment.reservedNotice')); load(); },
    onError: (e) => { toast(getErrorMessage(e, t('site.payment.failed')), 'error'); load(); }
  });

  const updated = (data, message) => {
    apply(data);
    setDialog(null);
    setNotice('');
    if (message) toast(message, 'success');
  };

  const setStatus = async (status) => {
    try {
      const { data } = await api.put(`/appointments/${id}/status`, { status });
      updated(data, t(`site.appointment.statusDone.${status}`));
    } catch (e) {
      throw new Error(getErrorMessage(e, t('site.common.failed')));
    }
  };

  const confirmBooking = async () => {
    setStatusBusy('CONFIRMED');
    try {
      await setStatus('CONFIRMED');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setStatusBusy('');
    }
  };

  const saveNotes = async (e) => {
    e.preventDefault();
    if (!notesDraft.trim()) {
      setNotesError(t('site.appointment.notesRequired'));
      return;
    }
    setNotesBusy(true);
    setNotesError('');
    try {
      const { data } = await api.put(`/appointments/${id}/notes`, { providerNotes: notesDraft.trim() });
      apply(data);
      setNotesOpen(false);
      toast(t('site.appointment.notesSaved'), 'success');
    } catch (err) {
      setNotesError(getErrorMessage(err, t('site.common.failed')));
    } finally {
      setNotesBusy(false);
    }
  };

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

  const role = user?.role;
  const back = backPathFor(role);

  if (!appt) {
    return (
      <div className="dash">
        <AccountNav />
        <div className="dash-main">
          {loadError ? (
            <div className="empty card card-pad">
              <h1 className="empty-title">{t('site.appointment.unavailable')}</h1>
              <p className="mt-1" role="alert">{loadError}</p>
              <div className="btn-row center-row mt-3">
                <button type="button" className="btn btn-primary btn-sm" onClick={load}>{t('common.retry')}</button>
                <Link className="btn btn-outline btn-sm" to={back}>{t('site.appointment.back')}</Link>
              </div>
            </div>
          ) : (
            <Loader label={t('common.loading')} />
          )}
        </div>
      </div>
    );
  }

  const a = appt.actions || {};
  const business = role === 'PROVIDER' || role === 'STAFF';
  const isCustomer = role === 'CUSTOMER';
  const tz = isValidTimeZone(appt.timezone) ? appt.timezone : null;
  const local = viewerClock(appt.startAt, tz, locale);
  const pay = appt.payment || {};
  const paidAmount = PAID.includes(pay.status) ? Number(pay.amount || 0) : 0;
  const cancelled = appt.status === 'CANCELLED';
  const active = ['PENDING', 'CONFIRMED', 'RESCHEDULED'].includes(appt.status);
  const showCancel = a.canCancel && !(business && a.canReject);
  const hasActions = a.canPay || a.canConfirm || a.canReject || showCancel || a.canReschedule || a.canComplete || a.canMarkNoShow || a.canReview;

  return (
    <div className="dash">
      <AccountNav />

      <div className="dash-main">
        <Link to={back} className="link-more back-link"><span aria-hidden="true">&larr;</span> {t('site.appointment.back')}</Link>

        {notice && (
          <div className="form-note mt-2" role="status">
            <span aria-hidden="true">{'ℹ'}</span>
            <span className="grow">{notice}</span>
            <button type="button" className="note-x" onClick={() => setNotice('')} aria-label={t('common.dismiss')}>
              <span aria-hidden="true">&#10005;</span>
            </button>
          </div>
        )}

        <header className="card card-pad mt-2 appt-head">
          <p className="eyebrow">{t('site.appointment.reference')}: <strong className="break-all">{appt.bookingRef}</strong></p>
          <h1 className="appt-title">{appt.serviceName}</h1>
          <p className="appt-sub">
            <Link to={`/providers/${appt.providerId}`}>{appt.providerName}</Link>
            {appt.staffName ? ` · ${t('site.appointment.withStaff', { name: appt.staffName })}` : ''}
          </p>
          <div className="badge-row">
            <StatusBadge status={appt.status} />
            <ModeBadge mode={appt.mode} />
            {(appt.paymentStatus || pay.status) && (
              <span className="badge-line">{t('site.appointment.paymentShort')}: <StatusBadge status={appt.paymentStatus || pay.status} /></span>
            )}
          </div>
          <p className="appt-when">{formatWhen(appt, locale)}</p>
          {local && <p className="tz-note">{t('site.slots.yourTime', { time: local })}</p>}

          {a.canPay && (
            <div className="pay-due mt-2">
              <p>
                {t('site.appointment.payDue', { amount: formatMoney(pay.amount || appt.finalAmount) })}{' '}
                {payDeadline && (
                  <Countdown deadline={payDeadline} onExpire={() => load()}
                    announce={(m) => tp(t, 'site.payment.minutesLeft', { count: m })} expiredText={t('site.payment.expired')} />
                )}
              </p>
            </div>
          )}

          {hasActions && (
            <div className="btn-row mt-3" role="group" aria-label={t('site.appointment.actions')}>
              {a.canPay && (
                <button type="button" className="btn btn-primary btn-sm" disabled={payment.busy} onClick={() => payment.start(appt.id)}>
                  {payment.busy ? <InlineLoader label={t('site.payment.processing')} /> : t('site.appointment.payNow')}
                </button>
              )}
              {a.canConfirm && (
                <button type="button" className="btn btn-success btn-sm" disabled={statusBusy === 'CONFIRMED'} onClick={confirmBooking}>
                  {statusBusy === 'CONFIRMED' ? <InlineLoader label={t('site.common.working')} /> : t('site.appointment.confirm')}
                </button>
              )}
              {a.canComplete && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog('complete')}>{t('site.appointment.complete')}</button>
              )}
              {a.canMarkNoShow && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog('noshow')}>{t('site.appointment.noShow')}</button>
              )}
              {a.canReschedule && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog('reschedule')}>{t('site.appointment.reschedule')}</button>
              )}
              {a.canReject && business && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog('reject')}>{t('site.appointment.reject')}</button>
              )}
              {showCancel && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog('cancel')}>{t('site.appointment.cancel')}</button>
              )}
              {a.canReview && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog('review')}>{t('site.appointment.review')}</button>
              )}
            </div>
          )}
          {isCustomer && appt.reviewed && <p className="form-success mt-2">{t('site.appointment.reviewed')}</p>}
        </header>

        <div className="appt-grid mt-3">
          <section className="card card-pad" aria-labelledby="appt-details">
            <h2 id="appt-details" className="section-h">{t('site.appointment.details')}</h2>
            <dl className="kv">
              <dt className="k">{t('site.booking.when')}</dt>
              <dd>{formatWhen(appt, locale)}{tz && <span className="tz-note block">{tz}</span>}</dd>
              <dt className="k">{t('site.booking.duration')}</dt><dd>{t('site.services.duration', { min: appt.durationMin })}</dd>
              <dt className="k">{t('site.booking.staff')}</dt><dd>{appt.staffName || t('site.appointment.anyStaff')}</dd>
              <dt className="k">{t('site.booking.format')}</dt><dd><ModeBadge mode={appt.mode} /></dd>
              {appt.mode === 'ONLINE' && (
                <>
                  <dt className="k">{t('site.appointment.meeting')}</dt>
                  <dd>
                    {appt.meetingLink && !cancelled ? (
                      <a href={appt.meetingLink} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-xs">
                        {t('site.appointment.joinMeeting')}<span className="sr-only"> {t('site.common.opensNewTab')}</span>
                      </a>
                    ) : '—'}
                    {appt.meetingLink && !cancelled && <span className="hint block break-all">{appt.meetingLink}</span>}
                  </dd>
                </>
              )}
              {appt.mode !== 'ONLINE' && appt.providerAddress && (
                <><dt className="k">{t('site.appointment.location')}</dt><dd>{appt.providerAddress}</dd></>
              )}
              {appt.providerPhone && (
                <><dt className="k">{t('site.appointment.providerPhone')}</dt><dd><a href={`tel:${appt.providerPhone}`}>{appt.providerPhone}</a></dd></>
              )}
              {!isCustomer && (
                <>
                  <dt className="k">{t('site.appointment.customer')}</dt>
                  <dd>
                    {appt.customerName}
                    {appt.customerEmail && <span className="block"><a href={`mailto:${appt.customerEmail}`} className="break-all">{appt.customerEmail}</a></span>}
                    {appt.customerPhone && <span className="block"><a href={`tel:${appt.customerPhone}`}>{appt.customerPhone}</a></span>}
                  </dd>
                </>
              )}
              <dt className="k">{t('site.appointment.customerNotes')}</dt><dd className="pre-wrap">{appt.notes || '—'}</dd>
              {appt.rescheduleCount > 0 && (
                <><dt className="k">{t('site.appointment.rescheduled')}</dt><dd>{tp(t, 'site.appointment.rescheduledTimes', { count: appt.rescheduleCount })}</dd></>
              )}
              <dt className="k">{t('site.appointment.bookedOn')}</dt><dd>{formatStamp(appt.createdAt, locale)}</dd>
            </dl>
          </section>

          <section className="card card-pad" aria-labelledby="appt-payment">
            <h2 id="appt-payment" className="section-h">{t('site.appointment.payment')}</h2>
            <dl className="kv">
              <dt className="k">{t('site.appointment.method')}</dt><dd>{pay.method ? statusLabel(pay.method) : '—'}</dd>
              {pay.option && <><dt className="k">{t('site.appointment.option')}</dt><dd>{t(`site.payOption.${pay.option}`)}</dd></>}
              <dt className="k">{t('site.appointment.status')}</dt><dd><StatusBadge status={appt.paymentStatus || pay.status} /></dd>
              <dt className="k">{t('site.booking.price')}</dt><dd>{formatMoney(appt.amount)}</dd>
              {appt.discount > 0 && (
                <><dt className="k">{t('site.booking.discount', { code: appt.couponCode || '' })}</dt><dd className="success-text">−{formatMoney(appt.discount)}</dd></>
              )}
              <dt className="k">{t('site.booking.total')}</dt><dd><strong>{formatMoney(appt.finalAmount)}</strong></dd>
              <dt className="k">{t('site.appointment.paid')}</dt><dd>{formatMoney(paidAmount)}{pay.paidAt ? ` · ${formatStamp(pay.paidAt, locale)}` : ''}</dd>
              {pay.balanceDue > 0 && !cancelled && (
                <><dt className="k">{t('site.appointment.balanceDue')}</dt><dd>{formatMoney(pay.balanceDue)}</dd></>
              )}
              {pay.refundAmount > 0 && (
                <>
                  <dt className="k">{t('site.appointment.refunded')}</dt>
                  <dd>
                    {formatMoney(pay.refundAmount)}{pay.refundedAt ? ` · ${formatStamp(pay.refundedAt, locale)}` : ''}
                    {pay.refundId && <span className="hint block break-all">{t('site.appointment.refundId', { id: pay.refundId })}</span>}
                  </dd>
                </>
              )}
              {pay.invoiceNumber && <><dt className="k">{t('site.appointment.invoiceNo')}</dt><dd className="break-all">{pay.invoiceNumber}</dd></>}
              {pay.transactionId && <><dt className="k">{t('site.appointment.txn')}</dt><dd className="break-all">{pay.transactionId}</dd></>}
            </dl>
            <div className="btn-row mt-2">
              {pay.invoiceNumber && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => download('invoice')} disabled={downloading === 'invoice'}>
                  {downloading === 'invoice' ? <InlineLoader label={t('site.appointment.downloading')} /> : t('site.appointment.invoice')}
                </button>
              )}
              {active && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => download('ics')} disabled={downloading === 'ics'}>
                  {downloading === 'ics' ? <InlineLoader label={t('site.appointment.downloading')} /> : t('site.appointment.addToCalendar')}
                </button>
              )}
            </div>
          </section>

          {(appt.providerNotes || a.canAddNotes) && (
            <section className="card card-pad appt-notes" aria-labelledby="appt-provider-notes">
              <h2 id="appt-provider-notes" className="section-h">{t('site.appointment.providerNotes')}</h2>
              {notesOpen ? (
                <form onSubmit={saveNotes}>
                  <div className="field">
                    <label htmlFor="provider-notes">{t('site.appointment.notesLabel')}</label>
                    <textarea id="provider-notes" rows={6} maxLength={NOTES_MAX} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)}
                      aria-describedby="provider-notes-hint" aria-invalid={Boolean(notesError) || undefined} />
                    <span className="hint" id="provider-notes-hint">{t('site.appointment.notesHint')} {tp(t, 'site.common.charsLeft', { count: NOTES_MAX - notesDraft.length })}</span>
                  </div>
                  {notesError && <div className="form-error" role="alert">{notesError}</div>}
                  <div className="btn-row">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={notesBusy}>
                      {notesBusy ? <InlineLoader label={t('site.common.saving')} /> : t('site.appointment.saveNotes')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotesOpen(false)} disabled={notesBusy}>{t('common.cancel')}</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="pre-wrap">{appt.providerNotes || <span className="muted">{t('site.appointment.noNotes')}</span>}</p>
                  {a.canAddNotes && (
                    <button type="button" className="btn btn-outline btn-sm mt-2"
                      onClick={() => { setNotesDraft(appt.providerNotes || ''); setNotesError(''); setNotesOpen(true); }}>
                      {appt.providerNotes ? t('site.appointment.editNotes') : t('site.appointment.addNotes')}
                    </button>
                  )}
                </>
              )}
            </section>
          )}

          {cancelled && (
            <section className="card card-pad" aria-labelledby="appt-cancel">
              <h2 id="appt-cancel" className="section-h">{t('site.appointment.cancellation')}</h2>
              <dl className="kv">
                <dt className="k">{t('site.appointment.cancelledBy')}</dt>
                <dd>{appt.cancelledBy ? t(`site.actor.${appt.cancelledBy}`) : '—'}</dd>
                <dt className="k">{t('site.appointment.cancelReason')}</dt><dd className="pre-wrap">{appt.cancelReason || '—'}</dd>
                <dt className="k">{t('site.appointment.cancelledAt')}</dt><dd>{appt.cancelledAt ? formatInstant(appt.cancelledAt, locale) : '—'}</dd>
              </dl>
            </section>
          )}
        </div>
      </div>

      {dialog === 'cancel' && (
        <CancelDialog appt={appt} actor={business ? 'BUSINESS' : role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER'}
          onClose={() => setDialog(null)} onDone={(data) => updated(data, t('site.cancel.done'))} />
      )}
      {dialog === 'reject' && (
        <CancelDialog appt={appt} actor="BUSINESS" reject onClose={() => setDialog(null)}
          onDone={(data) => updated(data, t('site.cancel.rejected'))} />
      )}
      {dialog === 'reschedule' && (
        <RescheduleDialog appt={appt} isCustomer={isCustomer} onClose={() => setDialog(null)}
          onDone={(data) => updated(data, t('site.reschedule.done'))} />
      )}
      {dialog === 'review' && (
        <ReviewDialog appt={appt} onClose={() => setDialog(null)}
          onDone={(review) => {
            setDialog(null);
            toast(review?.status === 'PENDING' ? t('site.review.thanksModerated') : t('site.review.thanks'), 'success');
            load();
          }} />
      )}
      {dialog === 'complete' && (
        <ConfirmDialog title={t('site.appointment.completeTitle')} text={t('site.appointment.completeText')}
          confirmLabel={t('site.appointment.complete')} onConfirm={() => setStatus('COMPLETED')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'noshow' && (
        <ConfirmDialog title={t('site.appointment.noShowTitle')} text={t('site.appointment.noShowText')} danger
          confirmLabel={t('site.appointment.noShow')} onConfirm={() => setStatus('NO_SHOW')} onClose={() => setDialog(null)} />
      )}
      {payment.dialog}
    </div>
  );
}

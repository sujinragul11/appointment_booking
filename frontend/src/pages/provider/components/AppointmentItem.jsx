import StatusBadge from '../../../components/StatusBadge';
import { useI18n } from '../../../i18n';
import { formatMoney } from '../../../utils/format';
import { canCollect } from '../lib/schedule';
import { fmtDate, fmtTime } from '../lib/time';
import AppointmentActions from './AppointmentActions';

/** One appointment in a compact list (dashboard, staff portal) with its actions. */
export default function AppointmentItem({ appt: a, onUpdated, allowCollect = false, showDate = false, headingLevel = 3 }) {
  const { t, locale } = useI18n();
  const H = `h${headingLevel}`;
  const awaitingPayment = a.status === 'PENDING' && a.paymentDueAt && !a.actions?.canConfirm;
  return (
    <li className="pp-appt">
      <div className="pp-appt-when">
        {showDate && <span className="pp-appt-date">{fmtDate(a.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
        <span className="pp-appt-time">{fmtTime(a.startTime, locale)}</span>
        <span className="pp-appt-end">{t('provider.schedule.until', { time: fmtTime(a.endTime, locale) })}</span>
      </div>
      <div className="pp-appt-main">
        <H className="pp-appt-title">{a.customerName} <span className="pp-appt-svc">· {a.serviceName}</span></H>
        <p className="pp-appt-meta">
          {[a.staffName, a.bookingRef, a.mode === 'ONLINE' ? t('provider.mode.ONLINE') : null].filter(Boolean).join(' · ')}
        </p>
        <div className="pp-appt-badges">
          <StatusBadge status={a.status} />
          {awaitingPayment && <span className="badge badge-amber">{t('provider.schedule.awaitingPayment')}</span>}
          {allowCollect && canCollect(a) && (
            <span className="badge badge-blue">{t('provider.schedule.due', { amount: formatMoney(a.payment.balanceDue) })}</span>
          )}
        </div>
      </div>
      <AppointmentActions appt={a} onUpdated={onUpdated} allowCollect={allowCollect} />
    </li>
  );
}

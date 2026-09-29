import ProviderNav from '../../../components/ProviderNav';
import StaffNav from '../../../components/StaffNav';
import { useT } from '../../../i18n';
import { InlineLoader } from '../../../components/Loader';
import { getErrorMessage } from '../../../api/client';
import { zoneAbbr } from '../lib/time';
import { useI18n } from '../../../i18n';

/** Provider portal page frame: sidebar + main column. */
export function ProviderShell({ children }) {
  return (
    <div className="dash pp">
      <ProviderNav />
      <div className="pp-main">{children}</div>
    </div>
  );
}

/** Staff portal page frame. */
export function StaffShell({ children }) {
  return (
    <div className="dash pp">
      <StaffNav />
      <div className="pp-main">{children}</div>
    </div>
  );
}

/** Page heading (the page's only h1), optional lead text and actions. */
export function PageHead({ title, lead, actions, children }) {
  return (
    <div className="pp-head">
      <div className="pp-head-text">
        <h1 className="pp-title">{title}</h1>
        {lead ? <p className="pp-lead">{lead}</p> : null}
        {children}
      </div>
      {actions ? <div className="pp-head-actions">{actions}</div> : null}
    </div>
  );
}

/** Load failure with the backend message and a retry button. */
export function ErrorState({ error, onRetry, title }) {
  const t = useT();
  return (
    <div className="pp-state pp-state-error card" role="alert">
      <h2 className="pp-state-title">{title || t('provider.common.loadFailed')}</h2>
      <p>{getErrorMessage(error, t('provider.common.tryAgainLater'))}</p>
      {onRetry ? <button type="button" className="btn btn-outline btn-sm mt-2" onClick={onRetry}>{t('provider.common.retry')}</button> : null}
    </div>
  );
}

export function EmptyState({ title, text, action, headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  return (
    <div className="pp-state card">
      <H className="pp-state-title">{title}</H>
      {text ? <p>{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Inline loading line for a section (the page keeps its frame). */
export function SectionLoading({ label }) {
  const t = useT();
  return (
    <p className="pp-loading" role="status">
      <InlineLoader label={label || t('provider.common.loading')} />
      <span aria-hidden="true"> {label || t('provider.common.loading')}</span>
    </p>
  );
}

/** "All times are in Asia/Kolkata (IST)". */
export function TimezoneNote({ timezone }) {
  const { t, locale } = useI18n();
  if (!timezone) return null;
  const abbr = zoneAbbr(timezone, locale);
  return (
    <p className="pp-tz">
      <span aria-hidden="true">◷ </span>
      {t('provider.tz.note', { zone: abbr && abbr !== timezone ? `${timezone} (${abbr})` : timezone })}
    </p>
  );
}

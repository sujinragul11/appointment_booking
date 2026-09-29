import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffPortalApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { StaffShell, PageHead, ErrorState, EmptyState, SectionLoading, TimezoneNote } from '../provider/components/Shell';
import AppointmentItem from '../provider/components/AppointmentItem';
import useLoad from '../provider/lib/useLoad';
import { toMinutes } from '../provider/lib/time';

export const STAFF_SCOPES = ['upcoming', 'past', 'cancelled'];

const ascending = (a, b) => String(a.date).localeCompare(String(b.date)) || toMinutes(a.startTime) - toMinutes(b.startTime);

/** Staff portal home: the signed-in staff member's own appointments (upcoming / past / cancelled). */
export default function StaffDashboard() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const scope = STAFF_SCOPES.includes(params.get('tab')) ? params.get('tab') : 'upcoming';
  const meQ = useLoad(() => staffPortalApi.me(), []);
  const listQ = useLoad(() => staffPortalApi.appointments(scope), [scope]);
  const tabRefs = useRef({});

  const me = meQ.data;
  // upcoming soonest first; history newest first (the API sends newest first)
  const list = scope === 'upcoming' ? [...(listQ.data || [])].sort(ascending) : (listQ.data || []);
  const timezone = list.find((a) => a.timezone)?.timezone;

  const select = (next, focus = false) => {
    setParams(next === 'upcoming' ? {} : { tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e) => {
    const i = STAFF_SCOPES.indexOf(scope);
    const moves = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in moves) {
      e.preventDefault();
      select(STAFF_SCOPES[(i + moves[e.key] + STAFF_SCOPES.length) % STAFF_SCOPES.length], true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(STAFF_SCOPES[e.key === 'Home' ? 0 : STAFF_SCOPES.length - 1], true);
    }
  };

  const onUpdated = (updated) => listQ.setData((items) => (items || []).map((a) => (a.id === updated.id ? updated : a)));

  return (
    <StaffShell>
      <PageHead title={t('provider.staffPortal.title')}
        lead={me ? t('provider.staffPortal.hello', { name: me.name, role: me.designation || t('provider.team.member') }) : t('provider.staffPortal.lead')} />
      {meQ.error && <ErrorState error={meQ.error} onRetry={meQ.reload} title={t('provider.staffPortal.profileFailed')} />}
      <TimezoneNote timezone={timezone} />

      <div className="pp-tabs" role="tablist" aria-label={t('provider.staffPortal.tabsLabel')} onKeyDown={onKeyDown}>
        {STAFF_SCOPES.map((s) => (
          <button key={s} type="button" role="tab" id={`staff-tab-${s}`} aria-selected={scope === s} aria-controls="staff-panel"
            tabIndex={scope === s ? 0 : -1} ref={(el) => { tabRefs.current[s] = el; }}
            className={scope === s ? 'active' : ''} onClick={() => select(s)}>
            {t(`provider.staffPortal.tabs.${s}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="staff-panel" aria-labelledby={`staff-tab-${scope}`} tabIndex={0} className="pp-tabpanel">
        {listQ.error ? <ErrorState error={listQ.error} onRetry={listQ.reload} /> : !listQ.data ? <SectionLoading /> : list.length === 0 ? (
          <EmptyState title={t(`provider.staffPortal.empty.${scope}`)} text={scope === 'upcoming' ? t('provider.staffPortal.emptyUpcomingText') : null} />
        ) : (
          <ul className="pp-appt-list card">
            {list.map((a) => <AppointmentItem key={a.id} appt={a} onUpdated={onUpdated} showDate headingLevel={2} />)}
          </ul>
        )}
      </div>
      <p className="pp-muted mt-2">{t('provider.staffPortal.notesHint')}</p>
    </StaffShell>
  );
}

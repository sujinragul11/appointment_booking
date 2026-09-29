import { useEffect, useMemo, useState } from 'react';
import { availabilityApi, staffPortalApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { StaffShell, PageHead, ErrorState, SectionLoading, TimezoneNote } from '../provider/components/Shell';
import BlockedDates from '../provider/components/BlockedDates';
import { WeeklyHours } from '../provider/ProviderAvailability';
import useLoad from '../provider/lib/useLoad';
import { weekFromWindows } from '../provider/lib/availability';
import { todayInZone } from '../provider/lib/time';

/** Staff portal: my weekly hours and my leave / blocked dates. */
export default function StaffAvailability() {
  const { t } = useI18n();
  const meQ = useLoad(() => staffPortalApi.me(), []);
  const bundleQ = useLoad(() => availabilityApi.mine(), []);
  const [blocked, setBlocked] = useState(null);
  const me = meQ.data;
  const bundle = bundleQ.data;
  const timezone = bundle?.timezone;
  const today = todayInZone(timezone);

  useEffect(() => {
    if (bundle) setBlocked(bundle.blockedDates || []);
  }, [bundle]);

  const businessWeek = useMemo(() => weekFromWindows(bundle?.availability || [], null), [bundle]);
  const onSaved = (saved, sid) => bundleQ.setData((b) => b && ({
    ...b, availability: [...(b.availability || []).filter((w) => (w.staffId ?? null) !== (sid ?? null)), ...saved]
  }));

  const error = meQ.error || bundleQ.error;
  const retry = () => { meQ.reload(); bundleQ.reload(); };

  return (
    <StaffShell>
      <PageHead title={t('provider.staffPortal.availabilityTitle')} lead={t('provider.staffPortal.availabilityLead')} />
      <TimezoneNote timezone={timezone} />
      {error ? <ErrorState error={error} onRetry={retry} /> : !me || !bundle ? <SectionLoading /> : (
        <>
          <section className="pp-section" aria-labelledby="my-hours">
            <h2 className="pp-h2" id="my-hours">{t('provider.staffPortal.myHours')}</h2>
            <WeeklyHours scopeKey={`staff-${me.id}`} staffId={me.id} windows={bundle.availability || []} onSaved={onSaved}
              emptyText={t('provider.availability.usesBusiness')} reference={businessWeek}
              referenceLabel={t('provider.availability.businessHours')}
              intro={<p className="pp-muted wk-intro">{t('provider.staffPortal.hoursIntro', { business: bundle.businessName || '' })}</p>} />
          </section>
          <section className="pp-section" aria-labelledby="my-leave">
            <h2 className="pp-h2" id="my-leave">{t('provider.staffPortal.myLeave')}</h2>
            <p className="pp-muted pp-section-lead">{t('provider.staffPortal.leaveLead')}</p>
            <BlockedDates entries={blocked || []} onChange={setBlocked} today={today}
              scopes={[{ value: String(me.id), label: me.name }]}
              scopeLabel={(sid) => (sid ? me.name : t('provider.staffPortal.wholeBusiness', { business: bundle.businessName || '' }))}
              canDelete={(b) => String(b.staffId ?? '') === String(me.id)} idPrefix="my-blk" />
          </section>
        </>
      )}
    </StaffShell>
  );
}

import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { availabilityApi, providerApi } from '../../api/provider';
import { useI18n } from '../../i18n';
import { ProviderShell, PageHead, ErrorState, SectionLoading, TimezoneNote } from './components/Shell';
import WeekEditor from './components/WeekEditor';
import BlockedDates from './components/BlockedDates';
import useLoad, { fieldErrorsOf } from './lib/useLoad';
import { copyMondayToWeekdays, validateWeek, weekFromWindows, weekSignature, weekToPayload } from './lib/availability';
import { todayInZone } from './lib/time';

const BUSINESS = 'business';

/**
 * Weekly hours editor for one scope (the business, or one staff member) with save status.
 * Used by the provider availability page and the staff portal.
 */
export function WeeklyHours({ scopeKey, staffId, windows, onSaved, reference, referenceLabel, emptyText, intro }) {
  const { t, locale } = useI18n();
  const uid = useId();
  const [week, setWeek] = useState(() => weekFromWindows(windows, staffId));
  const [baseline, setBaseline] = useState(() => weekSignature(weekFromWindows(windows, staffId)));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ kind: '', text: '' });

  const errors = useMemo(() => validateWeek(week), [week]);
  const errorCount = Object.keys(errors).length;
  const dirty = weekSignature(week) !== baseline;

  const change = (next) => {
    setWeek(next);
    if (status.kind === 'saved' || status.kind === 'error') setStatus({ kind: '', text: '' });
  };

  const save = async () => {
    if (errorCount) {
      setShowErrors(true);
      setStatus({ kind: 'error', text: t('provider.availability.fixBeforeSave', { count: errorCount }) });
      const first = document.querySelector(`[id^="${CSS_ID(uid)}"][aria-invalid="true"]`);
      first?.focus();
      return;
    }
    setSaving(true);
    setStatus({ kind: 'saving', text: t('provider.common.saving') });
    try {
      const saved = await availabilityApi.saveWeek(staffId, weekToPayload(week));
      const next = weekFromWindows(saved, staffId);
      setWeek(next);
      setBaseline(weekSignature(next));
      setShowErrors(false);
      onSaved?.(saved, staffId);
      const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date());
      setStatus({ kind: 'saved', text: t('provider.availability.saved', { time }) });
    } catch (err) {
      const fe = fieldErrorsOf(err);
      setStatus({ kind: 'error', text: getErrorMessage(err, t('provider.common.saveFailed')) + (Object.keys(fe).length ? ` (${Object.values(fe)[0]})` : '') });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const fresh = weekFromWindows(windows, staffId);
    setWeek(fresh);
    setBaseline(weekSignature(fresh));
    setShowErrors(false);
    setStatus({ kind: '', text: '' });
  };

  return (
    <div className="wk-editor card card-pad" data-scope={scopeKey}>
      {intro}
      <div className="wk-editor-tools">
        <button type="button" className="btn btn-outline btn-xs" onClick={() => change(copyMondayToWeekdays(week))} disabled={saving}>
          {t('provider.availability.copyMonday')}
        </button>
        {dirty && <span className="badge badge-amber">{t('provider.common.unsaved')}</span>}
      </div>
      <WeekEditor idPrefix={CSS_ID(uid)} week={week} onChange={change} errors={errors} showErrors={showErrors || errorCount > 0}
        emptyText={emptyText} reference={reference} referenceLabel={referenceLabel} disabled={saving} />
      <div className="wk-editor-foot">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || (!dirty && !showErrors)}>
          {saving ? t('provider.common.saving') : t('provider.availability.saveWeek')}
        </button>
        {dirty && !saving && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('provider.availability.discard')}</button>}
        <p className={`pp-save-status ${status.kind}`} role="status" aria-live="polite">{status.text}</p>
      </div>
    </div>
  );
}

// useId() returns ":r1:"-style ids; keep only safe characters so they work in selectors.
function CSS_ID(uid) {
  return `wk${String(uid).replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export default function ProviderAvailability() {
  const { t } = useI18n();
  const bundleQ = useLoad(() => availabilityApi.mine(), []);
  const staffQ = useLoad(() => providerApi.staff(), []);
  const [scope, setScope] = useState(BUSINESS);
  const [blocked, setBlocked] = useState(null);
  const selectId = useId();

  const bundle = bundleQ.data;
  const staff = (staffQ.data || []).filter((s) => s.active);
  const staffId = scope === BUSINESS ? null : Number(scope);
  const timezone = bundle?.timezone;
  const today = todayInZone(timezone);

  useEffect(() => {
    if (bundle) setBlocked(bundle.blockedDates || []);
  }, [bundle]);

  // keep the local copy of the windows in sync after a save, so switching scopes shows saved hours
  const onSaved = (saved, sid) => bundleQ.setData((b) => b && ({
    ...b,
    availability: [...(b.availability || []).filter((w) => (w.staffId ?? null) !== (sid ?? null)), ...saved]
  }));

  const businessWeek = useMemo(() => weekFromWindows(bundle?.availability || [], null), [bundle]);
  const staffName = (sid) => staff.find((s) => s.id === sid)?.name || (staffQ.data || []).find((s) => s.id === sid)?.name || t('provider.availability.staffMember');
  const scopes = [{ value: '', label: t('provider.availability.wholeBusiness') }, ...staff.map((s) => ({ value: String(s.id), label: s.name }))];
  const current = scope === BUSINESS ? t('provider.availability.wholeBusiness') : staffName(staffId);

  return (
    <ProviderShell>
      <PageHead title={t('provider.availability.title')} lead={t('provider.availability.lead')} />
      <TimezoneNote timezone={timezone} />
      {timezone && <p className="pp-muted pp-tz-link"><Link to="/dashboard/provider/settings">{t('provider.availability.changeTz')}</Link></p>}

      {bundleQ.error ? <ErrorState error={bundleQ.error} onRetry={bundleQ.reload} /> : !bundle ? <SectionLoading /> : (
        <>
          <section className="pp-section" aria-labelledby="hours-title">
            <div className="pp-section-head">
              <h2 className="pp-h2" id="hours-title">{t('provider.availability.weeklyTitle', { name: current })}</h2>
              <div className="field pp-scope">
                <label htmlFor={selectId}>{t('provider.availability.scope')}</label>
                <select id={selectId} value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value={BUSINESS}>{t('provider.availability.wholeBusiness')}</option>
                  {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <WeeklyHours key={scope} scopeKey={scope} staffId={staffId} windows={bundle.availability || []} onSaved={onSaved}
              emptyText={staffId ? t('provider.availability.usesBusiness') : t('provider.availability.closed')}
              reference={staffId ? businessWeek : undefined} referenceLabel={t('provider.availability.businessHours')}
              intro={<p className="pp-muted wk-intro">{staffId ? t('provider.availability.staffIntro', { name: current }) : t('provider.availability.businessIntro')}</p>} />
          </section>

          <section className="pp-section" aria-labelledby="blocked-title">
            <h2 className="pp-h2" id="blocked-title">{t('provider.blocked.title')}</h2>
            <p className="pp-muted pp-section-lead">{t('provider.blocked.lead')}</p>
            <BlockedDates entries={blocked || []} onChange={setBlocked} today={today}
              scopes={scopes}
              scopeLabel={(sid) => (sid ? staffName(sid) : t('provider.availability.wholeBusiness'))} />
          </section>
        </>
      )}
    </ProviderShell>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../../i18n';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';

/* Building blocks shared by the admin pages. */

/** ARIA tabs (automatic activation, arrow keys / Home / End). The panel id is `${idBase}-panel`. */
export function Tabs({ label, tabs, value, onChange, idBase }) {
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next == null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].key);
  };
  return (
    <div role="tablist" aria-label={label} className="tabs admin-tabs">
      {tabs.map((tab, i) => {
        const selected = tab.key === value;
        return (
          <button key={tab.key} type="button" role="tab" id={`${idBase}-tab-${tab.key}`} aria-selected={selected}
            aria-controls={`${idBase}-panel`} tabIndex={selected ? 0 : -1} className={`chip ${selected ? 'active' : ''}`}
            ref={(el) => { refs.current[i] = el; }} onClick={() => onChange(tab.key)} onKeyDown={(e) => onKeyDown(e, i)}>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, children, busy }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${value}`} aria-busy={busy || undefined}>
      {children}
    </div>
  );
}

/** Previous / next paging for PageResponse lists. */
export function Pager({ page, totalPages, onPage }) {
  const t = useT();
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label={t('admin.common.pagination')}>
      <button type="button" className="btn btn-outline btn-sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <span aria-hidden="true">&larr;</span> {t('admin.common.prev')}
      </button>
      <span className="adm-pager-status">{t('admin.common.pageOf', { page: page + 1, pages: totalPages })}</span>
      <button type="button" className="btn btn-outline btn-sm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>
        {t('admin.common.next')} <span aria-hidden="true">&rarr;</span>
      </button>
    </nav>
  );
}

/** Wide tables scroll inside this region (never the page); it is focusable so keyboards can scroll it. */
export function TableWrap({ label, children, busy }) {
  return (
    <div className={`card table-wrap admin-table-wrap ${busy ? 'adm-refreshing' : ''}`} role="region" aria-label={label}
      tabIndex={0} aria-busy={busy || undefined}>
      {children}
    </div>
  );
}

/**
 * Search box that commits its text after a short pause (or on Enter). External changes to
 * `value` (e.g. "clear filters") are reflected without fighting the user's typing.
 */
export function SearchBox({ value, onCommit, label, placeholder, delay = 350, type = 'search', inputMode, pattern, hint }) {
  const id = useId();
  const [text, setText] = useState(value || '');
  const committed = useRef(value || '');
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if ((value || '') !== committed.current) {
      committed.current = value || '';
      setText(value || '');
    }
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (q === committed.current) return undefined;
    const timer = setTimeout(() => {
      committed.current = q;
      commitRef.current(q);
    }, delay);
    return () => clearTimeout(timer);
  }, [text, delay]);

  const submit = (e) => {
    e.preventDefault();
    const q = text.trim();
    committed.current = q;
    commitRef.current(q);
  };

  return (
    <form role={type === 'search' ? 'search' : undefined} className={`field admin-filter ${type === 'search' ? 'admin-filter-grow' : ''}`}
      onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} inputMode={inputMode} pattern={pattern} value={text} placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => setText(e.target.value)} />
      {hint ? <span id={`${id}-hint`} className="hint">{hint}</span> : null}
    </form>
  );
}

/** A labelled <select> for filter bars. `options`: [{ value, label }]. */
export function FilterSelect({ label, value, onChange, options }) {
  const id = useId();
  return (
    <div className="field admin-filter">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function FilterDate({ label, value, onChange, min, max, invalid, describedBy }) {
  const id = useId();
  return (
    <div className="field admin-filter">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} />
    </div>
  );
}

/** CSV / PDF export buttons with a busy state; failures show the backend message. */
export function ExportButtons({ onExport, label, disabled }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (format) => {
    setBusy(format);
    try {
      const name = await onExport(format);
      toast(t('admin.common.downloaded', { name }), 'success');
    } catch (err) {
      toast(getErrorMessage(err, t('admin.common.exportFailed')), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="admin-export" role="group" aria-label={label}>
      {['csv', 'pdf'].map((format) => (
        <button key={format} type="button" className="btn btn-outline btn-sm" disabled={Boolean(busy) || disabled}
          aria-busy={busy === format || undefined} onClick={() => run(format)}>
          {busy === format ? t('admin.common.preparing') : t(`admin.common.export_${format}`)}
        </button>
      ))}
    </div>
  );
}

/** Confirmation dialog for destructive actions; the error (if any) is shown inside it. */
export function ConfirmDialog({
  title, children, confirmLabel, busyLabel, onConfirm, onClose, busy, error, danger = true, extra, confirmHidden = false
}) {
  const t = useT();
  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <div className="adm-confirm">{children}</div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="adm-dialog-actions">
        <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
          {confirmHidden ? t('admin.common.close') : t('admin.common.cancel')}
        </button>
        {extra}
        {confirmHidden ? null : (
          <button type="button" className={`btn ${danger ? 'adm-btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel || t('admin.common.working') : confirmLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Loading / error / empty states for a data block. Renders children once data is present. */
export function DataState({ loading, error, empty, emptyTitle, emptyText, onRetry, hasData, children }) {
  const t = useT();
  if (error && !hasData) {
    return (
      <div className="card card-pad admin-state" role="alert">
        <h2 className="admin-state-title">{t('admin.common.loadError')}</h2>
        <p>{getErrorMessage(error, t('admin.common.loadErrorText'))}</p>
        {onRetry ? <button type="button" className="btn btn-outline btn-sm mt-2" onClick={onRetry}>{t('admin.common.retry')}</button> : null}
      </div>
    );
  }
  if (loading && !hasData) {
    return (
      <div className="card card-pad admin-state" role="status">
        <span className="spinner dark" aria-hidden="true" /> <span>{t('admin.common.loading')}</span>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="card card-pad admin-state">
        <h2 className="admin-state-title">{emptyTitle}</h2>
        {emptyText ? <p>{emptyText}</p> : null}
      </div>
    );
  }
  return (
    <>
      {error ? <p className="form-error" role="alert">{getErrorMessage(error, t('admin.common.loadErrorText'))}</p> : null}
      {children}
    </>
  );
}

/** Field-level errors from a 400 response ({ errors: { field: message } }). */
export function fieldErrors(err) {
  const errors = err?.response?.data?.errors;
  return errors && typeof errors === 'object' ? errors : {};
}

/**
 * Labelled form field. `children(props)` renders the control with id / aria-describedby /
 * aria-invalid wired to the hint and the error message.
 */
export function Field({ label, hint, error, required, children, className = '' }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="adm-req" aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {hint ? <span id={hintId} className="hint">{hint}</span> : null}
      {error ? <span id={errorId} className="hint error-text">{error}</span> : null}
    </div>
  );
}

/** Headline figures as a definition list: label, value and an optional sub line / link. */
export function KpiGrid({ items, label }) {
  return (
    <dl className="adm-kpi-grid" aria-label={label}>
      {items.map((item) => (
        <div key={item.key} className="adm-kpi">
          <dt className="adm-kpi-label">{item.label}</dt>
          <dd className="adm-kpi-value">{item.value}</dd>
          {item.sub ? <dd className="adm-kpi-sub">{item.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

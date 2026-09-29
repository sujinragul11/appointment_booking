import { useT } from '../../../i18n';

/**
 * Labelled form field with an optional hint and error. `children` is a render function that
 * receives the props the control needs (id, aria-describedby, aria-invalid, required).
 */
export default function Field({ id, label, hint, error, required = false, optional = false, className = '', children }) {
  const t = useT();
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="pp-req" aria-hidden="true"> *</span> : null}
        {optional ? <span className="pp-opt"> ({t('provider.common.optional')})</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required: required || undefined })}
      {error ? <span className="hint error-text" id={errorId}>{error}</span> : null}
      {hint ? <span className="hint" id={hintId}>{hint}</span> : null}
    </div>
  );
}

/** Summary of form errors shown above the submit button (announced when it appears). */
export function ErrorSummary({ message, errors = {}, labels = {} }) {
  const t = useT();
  const entries = Object.entries(errors).filter(([, v]) => v);
  if (!message && entries.length === 0) return null;
  return (
    <div className="form-error" role="alert">
      <strong>{message || t('provider.common.fixErrors')}</strong>
      {entries.length > 0 && (
        <ul className="pp-error-list">
          {entries.map(([field, msg]) => (
            <li key={field}>{labels[field] ? `${labels[field]}: ` : ''}{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

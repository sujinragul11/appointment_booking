import { useCallback, useEffect, useId, useRef } from 'react';
import { useT } from '../i18n';

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

const focusableIn = (root) => (root ? Array.from(root.querySelectorAll(FOCUSABLE)) : []);

/**
 * Accessible dialog: role="dialog" + aria-modal, focus trapped inside, Escape closes,
 * focus returns to the opener. `closeDisabled` blocks every way of closing (use while busy);
 * `closeOnBackdrop={false}` keeps a stray click outside from dismissing it.
 */
export default function Modal({ title, onClose, children, wide = false, closeDisabled = false, closeOnBackdrop = true }) {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const latest = useRef({ onClose, closeDisabled });
  latest.current = { onClose, closeDisabled };

  const requestClose = useCallback(() => {
    if (!latest.current.closeDisabled && latest.current.onClose) latest.current.onClose();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const first = focusableIn(dialog.querySelector('.modal-body'))[0];
    (first || dialog).focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !dialog.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !dialog.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [requestClose]);

  return (
    <div className="modal-backdrop"
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (closeOnBackdrop && pressedBackdrop.current && e.target === e.currentTarget) requestClose();
        pressedBackdrop.current = false;
      }}>
      <div ref={dialogRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-x" onClick={requestClose} disabled={closeDisabled} aria-label={t('common.close')}>
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

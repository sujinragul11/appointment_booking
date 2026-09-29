import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useT } from '../i18n';

const ToastContext = createContext(() => {});

// Errors stay a little longer so they can be read (and every toast can be dismissed).
const DURATION = { error: 6000, default: 3500 };

export function ToastProvider({ children }) {
  const t = useT();
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[type] || DURATION.default));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Always mounted so screen readers pick up toasts as they are added. */}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.type}`}>
            <span aria-hidden="true">{x.type === 'success' ? '✓' : x.type === 'error' ? '!' : 'ℹ'}</span>
            <span>{x.message}</span>
            <button type="button" className="toast-x" onClick={() => dismiss(x.id)} aria-label={t('common.dismiss')}>
              <span aria-hidden="true">&#10005;</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

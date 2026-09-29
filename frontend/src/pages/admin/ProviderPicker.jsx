import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useStatusLabel } from '../../components/StatusBadge';
import { fetchProviders } from '../../api/admin';
import { usePlural } from './adminHooks';

/**
 * Searchable provider select: an ARIA 1.2 combobox whose listbox is filled from
 * GET /api/admin/providers?q= (all statuses). `value` is { id, name } or null; `onChange`
 * receives { id, name, city, status } or null. Typing replaces the selection; leaving the
 * field without choosing puts the selected name back.
 */
export default function ProviderPicker({ label, value, onChange, hint, error, required, placeholder, className = '' }) {
  const t = useT();
  const statusLabel = useStatusLabel();
  const plural = usePlural();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const inputId = `pp-${uid}`;
  const listId = `pp-${uid}-list`;
  const hintId = hint ? `pp-${uid}-hint` : undefined;
  const errorId = error ? `pp-${uid}-error` : undefined;
  const inputRef = useRef(null);
  const [text, setText] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null);
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [activeIndex, setActiveIndex] = useState(-1);

  // Sync the text with value changes made by the parent (e.g. "clear filters"), but not with
  // the ones this field emitted itself (typing clears the selection and must keep the text).
  const emitted = useRef(value?.id ?? null);
  const emit = (next) => {
    emitted.current = next?.id ?? null;
    onChange(next);
  };
  useEffect(() => {
    const id = value?.id ?? null;
    if (id === emitted.current) return;
    emitted.current = id;
    setText(value?.name || '');
  }, [value?.id, value?.name]);

  useEffect(() => {
    if (query == null) return undefined;
    let cancelled = false;
    setStatus('loading');
    const timer = setTimeout(() => {
      fetchProviders({ q: query, size: 8 }).then(
        (page) => {
          if (cancelled) return;
          setOptions(Array.isArray(page?.content) ? page.content : []);
          setActiveIndex(-1);
          setStatus('done');
        },
        () => {
          if (cancelled) return;
          setOptions([]);
          setStatus('error');
        }
      );
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const search = (q) => {
    setOpen(true);
    setQuery(q);
  };

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const choose = (p) => {
    close();
    setText(p.businessName);
    emit({ id: p.id, name: p.businessName, city: p.city, status: p.status });
  };

  const clear = () => {
    setText('');
    close();
    emit(null);
    inputRef.current?.focus();
  };

  const onInput = (e) => {
    setText(e.target.value);
    if (value) emit(null);
    search(e.target.value.trim());
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) search(text.trim() === (value?.name || '') ? '' : text.trim());
      else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      if (!open) return;
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        e.preventDefault();
        choose(options[activeIndex]);
      }
    } else if (e.key === 'Escape' && open) {
      // Close only the list (not an enclosing dialog).
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const onBlur = () => {
    close();
    if (!value) setText('');
    else setText(value.name);
  };

  const showList = open && options.length > 0;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const liveText = !open ? '' : status === 'loading' ? t('admin.picker.searching')
    : status === 'error' ? t('admin.picker.error')
      : status === 'done' ? (options.length ? plural('admin.picker.found', options.length) : t('admin.picker.none')) : '';

  return (
    <div className={`field adm-combo ${className}`}>
      <label htmlFor={inputId}>
        {label}
        {required ? <span className="adm-req" aria-hidden="true"> *</span> : null}
      </label>
      <div className="adm-combo-control">
        <input ref={inputRef} id={inputId} type="text" role="combobox" autoComplete="off" value={text}
          placeholder={placeholder || t('admin.picker.placeholder')}
          aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 && options[activeIndex] ? `${listId}-${options[activeIndex].id}` : undefined}
          aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required || undefined}
          onChange={onInput} onKeyDown={onKeyDown} onBlur={onBlur}
          onClick={() => { if (!open) search(text.trim() === (value?.name || '') ? '' : text.trim()); }} />
        {value ? (
          <button type="button" className="adm-combo-clear" onClick={clear} aria-label={t('admin.picker.clear', { name: value.name })}>
            <span aria-hidden="true">&#10005;</span>
          </button>
        ) : null}
        <ul id={listId} role="listbox" className="adm-combo-list" aria-label={label} hidden={!showList}>
          {options.map((p, i) => (
            <li key={p.id} id={`${listId}-${p.id}`} role="option" aria-selected={i === activeIndex}
              className={`adm-combo-option ${i === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiveIndex(i)} onClick={() => choose(p)}>
              <span className="adm-combo-name">{p.businessName}</span>
              <span className="adm-combo-meta">{[p.city, statusLabel(p.status)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
        {open && status === 'done' && options.length === 0 ? <div className="adm-combo-note">{t('admin.picker.none')}</div> : null}
      </div>
      {hint ? <span id={hintId} className="hint">{hint}</span> : null}
      {error ? <span id={errorId} className="hint error-text">{error}</span> : null}
      <span className="sr-only" aria-live="polite">{liveText}</span>
    </div>
  );
}

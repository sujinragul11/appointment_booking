import { useT } from '../i18n';

/** Previous / next pagination for PageResponse lists (page is 0-based). */
export default function Pager({ page, totalPages, totalElements, onChange }) {
  const t = useT();
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label={t('site.pager.label')}>
      <button type="button" className="btn btn-outline btn-sm" disabled={page <= 0} onClick={() => onChange(page - 1)}>
        <span aria-hidden="true">&larr;</span> {t('site.pager.prev')}
      </button>
      <span className="pager-status">
        {t('site.pager.status', { page: page + 1, pages: totalPages, total: totalElements ?? 0 })}
      </span>
      <button type="button" className="btn btn-outline btn-sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
        {t('site.pager.next')} <span aria-hidden="true">&rarr;</span>
      </button>
    </nav>
  );
}

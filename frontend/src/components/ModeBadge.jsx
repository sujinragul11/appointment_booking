import { useT } from '../i18n';

const GLYPH = { ONLINE: '\u{1F4BB}', IN_PERSON: '\u{1F4CD}', BOTH: '⇄' };
const CLS = { ONLINE: 'badge-violet', IN_PERSON: 'badge-gray', BOTH: 'badge-blue' };

/** Service / appointment mode (FR-26): in person, online, or either. */
export default function ModeBadge({ mode }) {
  const t = useT();
  if (!mode) return null;
  return (
    <span className={`badge ${CLS[mode] || 'badge-gray'}`}>
      <span aria-hidden="true">{GLYPH[mode] || ''}</span> {t(`site.mode.${mode}`)}
    </span>
  );
}

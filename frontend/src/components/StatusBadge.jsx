import { useT } from '../i18n';

const styles = {
  CONFIRMED: ['badge-green', '✓'],
  PENDING: ['badge-amber', '○'],
  IN_PROGRESS: ['badge-blue', ''],
  COMPLETED: ['badge-primary', '✓'],
  CANCELLED: ['badge-red', '✕'],
  NO_SHOW: ['badge-red', ''],
  RESCHEDULED: ['badge-gray', '↻'],
  PAID: ['badge-green', '✓'],
  SUCCESS: ['badge-green', '✓'],
  REFUNDED: ['badge-amber', '↶'],
  FAILED: ['badge-red', '✕'],
  PENDING_PAYMENT: ['badge-amber', '○'],
  PAY_AT_VENUE: ['badge-blue', 'Ⓣ'],
  ONLINE: ['badge-primary', 'ⓑ'],
  VERIFIED: ['badge-green', '✓'],
  PENDING_APPROVAL: ['badge-amber', '○'],
  REJECTED: ['badge-red', '✕'],
  SUSPENDED: ['badge-red', ''],
  UNAVAILABLE: ['badge-red', '✕'],
  BOOKED: ['badge-blue', '○'],
  AVAILABLE: ['badge-green', '✓'],
  FLAT: ['badge-gray', '₹'],
  PERCENT: ['badge-primary', '%']
};

/** Translated label for a status code; unknown codes are shown as-is ("SOME_CODE" -> "SOME CODE"). */
export function useStatusLabel() {
  const t = useT();
  return (status) => {
    if (!status) return '';
    const key = `status.${status}`;
    const label = t(key);
    return label === key ? String(status).replace(/_/g, ' ') : label;
  };
}

export default function StatusBadge({ status }) {
  const statusLabel = useStatusLabel();
  const [cls, glyph] = styles[status] || ['badge-gray', ''];
  return (
    <span className={`badge ${cls}`}>
      {glyph ? <span aria-hidden="true">{glyph} </span> : null}{statusLabel(status)}
    </span>
  );
}

export function TypeBadge({ type }) {
  const statusLabel = useStatusLabel();
  const [cls, glyph] = styles[type] || ['badge-gray', ''];
  return (
    <span className={`badge ${cls}`}>
      {glyph ? <span aria-hidden="true">{glyph} </span> : null}{statusLabel(type)}
    </span>
  );
}

const styles = {
  CONFIRMED: ['badge-green', '\u2713'],
  PENDING: ['badge-amber', '\u25CB'],
  IN_PROGRESS: ['badge-blue', ''],
  COMPLETED: ['badge-primary', '\u2713'],
  CANCELLED: ['badge-red', '\u2715'],
  NO_SHOW: ['badge-red', ''],
  RESCHEDULED: ['badge-gray', '\u21BB'],
  PAID: ['badge-green', '\u2713'],
  SUCCESS: ['badge-green', '\u2713'],
  REFUNDED: ['badge-amber', '\u21B6'],
  FAILED: ['badge-red', '\u2715'],
  PENDING_PAYMENT: ['badge-amber', '\u25CB'],
  PAY_AT_VENUE: ['badge-blue', '\u24C9'],
  ONLINE: ['badge-primary', '\u24D1'],
  VERIFIED: ['badge-green', '\u2713'],
  PENDING_APPROVAL: ['badge-amber', '\u25CB'],
  REJECTED: ['badge-red', '\u2715'],
  SUSPENDED: ['badge-red', ''],
  UNAVAILABLE: ['badge-red', '\u2715'],
  BOOKED: ['badge-blue', '\u25CB'],
  AVAILABLE: ['badge-green', '\u2713'],
  FLAT: ['badge-gray', '\u20B9'],
  PERCENT: ['badge-primary', '%']
};

export default function StatusBadge({ status }) {
  const [cls, glyph] = styles[status] || ['badge-gray', ''];
  const label = String(status || '').replace(/_/g, ' ');
  return <span className={`badge ${cls}`}>{glyph ? glyph + ' ' : ''}{label}</span>;
}

export function TypeBadge({ type }) {
  const [cls, glyph] = styles[type] || ['badge-gray', ''];
  return <span className={`badge ${cls}`}>{glyph && glyph + ' '}{String(type || '').replace(/_/g, ' ')}</span>;
}
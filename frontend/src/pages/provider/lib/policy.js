/*
 * Cancellation / reschedule policy text (FR-17, FR-28, FR-29).
 * When the provider leaves the free-text policy empty the backend generates a sentence from the
 * numbers (DtoMapper.describePolicy) and returns it in policy.cancellationPolicy. The response does
 * not say whether the text is custom, so we regenerate the backend's English sentence to tell.
 */

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Exact replica of the backend's generated (English) policy sentence. */
export function describePolicyEn(p = {}) {
  const cutoff = num(p.cancellationCutoffHours);
  const late = num(p.lateCancelRefundPercent);
  const max = num(p.maxReschedules);
  let s = `Free cancellation up to ${cutoff} hours before the appointment`;
  s += late > 0 ? `; later cancellations are refunded ${late}%.` : '; later cancellations are not refunded.';
  if (max > 0) {
    s += ` Reschedule up to ${max} time(s), at least ${num(p.rescheduleCutoffHours)} hours before the start.`;
  }
  return s;
}

/** True when policy.cancellationPolicy is the provider's own text rather than the generated one. */
export function isCustomPolicy(policy) {
  const text = policy?.cancellationPolicy?.trim();
  if (!text) return false;
  return text !== describePolicyEn(policy).trim();
}

/** The generated policy sentence in the UI language (same rules as the backend). */
export function policyPreview(t, p = {}) {
  const parts = [t('provider.policyText.free', { hours: num(p.cancellationCutoffHours) })];
  const late = num(p.lateCancelRefundPercent);
  parts.push(late > 0 ? t('provider.policyText.lateRefund', { percent: late }) : t('provider.policyText.lateNoRefund'));
  const max = num(p.maxReschedules);
  if (max > 0) {
    parts.push(t('provider.policyText.reschedule', { count: max, hours: num(p.rescheduleCutoffHours) }));
  }
  return parts.join('');
}

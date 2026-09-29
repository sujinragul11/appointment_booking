import { describe, expect, it } from 'vitest';
import { translate } from '../../../i18n';
import { describePolicyEn, isCustomPolicy, policyPreview } from './policy';

const en = (key, vars) => translate('en', key, vars);
const policy = { cancellationCutoffHours: 24, lateCancelRefundPercent: 50, rescheduleCutoffHours: 12, maxReschedules: 2 };

describe('describePolicyEn (replica of the backend sentence)', () => {
  it('matches the text the API generates for the demo clinic', () => {
    // GET /api/provider/me for provider@booking.com (DtoMapper.describePolicy)
    expect(describePolicyEn(policy)).toBe('Free cancellation up to 24 hours before the appointment; later cancellations are refunded 50%. '
      + 'Reschedule up to 2 time(s), at least 12 hours before the start.');
  });

  it('covers no late refund and no rescheduling', () => {
    expect(describePolicyEn({ ...policy, lateCancelRefundPercent: 0, maxReschedules: 0 }))
      .toBe('Free cancellation up to 24 hours before the appointment; later cancellations are not refunded.');
  });
});

describe('isCustomPolicy', () => {
  it('is false for the generated text or no text', () => {
    expect(isCustomPolicy({ ...policy, cancellationPolicy: describePolicyEn(policy) })).toBe(false);
    expect(isCustomPolicy({ ...policy, cancellationPolicy: '' })).toBe(false);
    expect(isCustomPolicy(undefined)).toBe(false);
  });

  it('is true for the provider\'s own wording', () => {
    expect(isCustomPolicy({ ...policy, cancellationPolicy: 'Cancel by phone at least a day ahead.' })).toBe(true);
  });
});

describe('policyPreview (live preview in the settings form)', () => {
  it('is identical to the backend sentence in English, from form strings', () => {
    const form = { cancellationCutoffHours: '48', lateCancelRefundPercent: '25', rescheduleCutoffHours: '6', maxReschedules: '1' };
    expect(policyPreview(en, form)).toBe(describePolicyEn(form));
    expect(policyPreview(en, { ...form, lateCancelRefundPercent: '0', maxReschedules: '0' })).toBe(describePolicyEn({ ...form, lateCancelRefundPercent: 0, maxReschedules: 0 }));
  });

  it('is translated for the other languages', () => {
    const hi = policyPreview((k, v) => translate('hi', k, v), policy);
    const ta = policyPreview((k, v) => translate('ta', k, v), policy);
    [hi, ta].forEach((text) => {
      expect(text).not.toBe(describePolicyEn(policy));
      expect(text).toContain('24');
      expect(text).toContain('50');
      expect(text).toContain('12');
    });
  });
});

/**
 * GET /slots used to return a bare array; the rebuilt backend wraps it as
 * { closed, message, timezone, slots: [...] }. Accept both.
 * Returns { slots, message } where message explains a closed day (may be '').
 */
export function parseSlots(data) {
  if (Array.isArray(data)) return { slots: data, message: '' };
  const slots = Array.isArray(data?.slots) ? data.slots : [];
  return { slots, message: data?.closed && data?.message ? String(data.message) : '' };
}

export const isOpenSlot = (s) => !s?.status || s.status === 'AVAILABLE';

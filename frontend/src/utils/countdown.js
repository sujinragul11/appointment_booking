/*
 * Countdowns for slot holds and payment windows. The server sends absolute instants
 * (expiresAt, paymentDueAt); the browser clock may be off, so the remaining time is
 * measured against the server's clock (the response's Date header) when it is known.
 */

/**
 * Local epoch ms at which `expiresAt` (server instant) is reached, correcting for clock skew.
 * The Date header is truncated to whole seconds and the response took time to arrive, so one
 * second is taken off: the countdown may end a moment early, never late.
 */
export function localDeadline(expiresAt, serverDate, now = Date.now()) {
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return null;
  const server = Date.parse(serverDate);
  if (Number.isNaN(server)) return expires;
  return now + (expires - server) - 1000;
}

/** Milliseconds left until `deadline` (epoch ms), never negative. */
export function msUntil(deadline, now = Date.now()) {
  if (deadline == null || Number.isNaN(Number(deadline))) return 0;
  return Math.max(0, Number(deadline) - now);
}

/** "09:05" (minutes:seconds, rounded up to the next second). */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Whole minutes left, rounded up. Screen readers hear this, so it changes once a minute. */
export function minutesLeft(ms) {
  return Math.max(0, Math.ceil(ms / 60000));
}

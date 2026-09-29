import { useEffect, useRef, useState } from 'react';
import { formatCountdown, minutesLeft, msUntil } from '../utils/countdown';

/**
 * Visible mm:ss countdown to `deadline` (epoch ms). Screen readers are told the remaining
 * minutes through a polite live region that changes once a minute, not every second.
 * `announce(minutes)` and `expiredText` provide the (translated) spoken text.
 */
export default function Countdown({ deadline, onExpire, announce, expiredText = '', className = '' }) {
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const ms = msUntil(deadline, now);
  const expired = ms <= 0;

  useEffect(() => {
    if (expired) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expired, deadline]);

  useEffect(() => {
    setNow(Date.now());
  }, [deadline]);

  useEffect(() => {
    if (expired && expireRef.current) expireRef.current();
  }, [expired]);

  return (
    <span className={`countdown ${expired ? 'expired' : ''} ${className}`.trim()}>
      <span aria-hidden="true" className="countdown-clock">{formatCountdown(ms)}</span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {expired ? expiredText : announce ? announce(minutesLeft(ms)) : ''}
      </span>
    </span>
  );
}

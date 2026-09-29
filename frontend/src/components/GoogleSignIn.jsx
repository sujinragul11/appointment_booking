import { useEffect, useRef, useState } from 'react';
import { GOOGLE_GSI_SRC, getConfig, loadScript } from '../api/site';
import { useI18n } from '../i18n';

/**
 * "Sign in with Google" (FR-6). Rendered only when GET /config returns a googleClientId.
 * Google Identity Services renders its own accessible button; `onCredential(idToken)` gets
 * the ID token to POST to /auth/google.
 */
export default function GoogleSignIn({ onCredential, disabled = false }) {
  const { t, lang } = useI18n();
  const [clientId, setClientId] = useState('');
  const [failed, setFailed] = useState(false);
  const slot = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    let active = true;
    getConfig().then((c) => { if (active) setClientId(String(c?.googleClientId || '').trim()); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return undefined;
    let active = true;
    loadScript(GOOGLE_GSI_SRC)
      .then(() => {
        const gsi = window.google?.accounts?.id;
        if (!active || !gsi || !slot.current) return;
        gsi.initialize({
          client_id: clientId,
          callback: (response) => { if (response?.credential) callback.current?.(response.credential); }
        });
        slot.current.innerHTML = '';
        gsi.renderButton(slot.current, {
          type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: lang,
          width: Math.min(360, slot.current.clientWidth || 320)
        });
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [clientId, lang]);

  if (!clientId) return null;

  return (
    <div className="google-signin" aria-busy={disabled || undefined}>
      <div className="or-divider" role="separator"><span>{t('site.auth.or')}</span></div>
      {failed ? (
        <p className="hint" role="status">{t('site.auth.googleUnavailable')}</p>
      ) : (
        <div ref={slot} className="google-btn-slot" data-testid="google-signin" />
      )}
    </div>
  );
}

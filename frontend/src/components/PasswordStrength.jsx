import { checkPassword, PASSWORD_RULES } from '../utils/password';
import { useT } from '../i18n';

/**
 * Strength meter + requirement checklist for a password input (FR-8).
 * Point the input's aria-describedby at `id` so the requirements are read with it.
 */
export default function PasswordStrength({ password = '', id }) {
  const t = useT();
  const { checks, score, level } = checkPassword(password);

  return (
    <div className="pw-strength" id={id} data-level={level || 'empty'}>
      <div className="pw-meter" aria-hidden="true">
        {PASSWORD_RULES.map((rule, i) => (
          <span key={rule} className={i < score ? 'on' : ''} />
        ))}
      </div>
      {level && (
        <p className="pw-level" aria-live="polite">
          {t('password.strength', { level: t(`password.levels.${level}`) })}
        </p>
      )}
      <p className="pw-req">{t('password.requirements')}</p>
      <ul className="pw-checks">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule} className={checks[rule] ? 'met' : ''} data-rule={rule} data-met={checks[rule] ? 'true' : 'false'}>
            <span aria-hidden="true">{checks[rule] ? '✓' : '○'}</span>
            {t(`password.rules.${rule}`)}
            <span className="sr-only"> ({checks[rule] ? t('password.met') : t('password.notMet')})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

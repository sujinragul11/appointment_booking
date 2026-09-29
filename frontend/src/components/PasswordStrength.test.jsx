import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrength from './PasswordStrength';

const rule = (name) => document.querySelector(`[data-rule="${name}"]`);

describe('PasswordStrength', () => {
  it('lists every requirement as unmet for an empty password, without a level', () => {
    render(<PasswordStrength password="" id="pw-help" />);
    expect(document.getElementById('pw-help')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    ['length', 'lower', 'upper', 'number'].forEach((r) => expect(rule(r)).toHaveAttribute('data-met', 'false'));
    expect(screen.queryByText(/Password strength/)).toBeNull();
  });

  it('ticks the rules that are met and shows a weak level', () => {
    render(<PasswordStrength password="abc1" />);
    expect(rule('lower')).toHaveAttribute('data-met', 'true');
    expect(rule('number')).toHaveAttribute('data-met', 'true');
    expect(rule('upper')).toHaveAttribute('data-met', 'false');
    expect(rule('length')).toHaveAttribute('data-met', 'false');
    expect(screen.getByText('Password strength: Weak')).toBeInTheDocument();
  });

  it('shows all rules met for a valid password', () => {
    render(<PasswordStrength password="Abcdefg1" />);
    ['length', 'lower', 'upper', 'number'].forEach((r) => expect(rule(r)).toHaveAttribute('data-met', 'true'));
    expect(screen.getByText('Password strength: Good')).toBeInTheDocument();
    expect(document.querySelectorAll('.pw-meter .on')).toHaveLength(4);
  });

  it('rates long passwords or ones with symbols as strong', () => {
    render(<PasswordStrength password="Abcdefg1!" />);
    expect(screen.getByText('Password strength: Strong')).toBeInTheDocument();
  });

  it('gives screen readers the met / missing state of each rule', () => {
    render(<PasswordStrength password="abcdefgh" />);
    expect(rule('length')).toHaveTextContent('At least 8 characters (done)');
    expect(rule('upper')).toHaveTextContent('An uppercase letter (A–Z) (missing)');
  });
});

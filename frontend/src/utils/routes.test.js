import { describe, expect, it } from 'vitest';
import { homePathFor, loginPath, nextFromLocation, safeRedirect } from './routes';

describe('route helpers', () => {
  it('maps roles to their home page, unknown roles to "/"', () => {
    expect(homePathFor('ADMIN')).toBe('/dashboard/admin');
    expect(homePathFor('PROVIDER')).toBe('/dashboard/provider');
    expect(homePathFor('CUSTOMER')).toBe('/dashboard');
    expect(homePathFor('STAFF')).toBe('/dashboard/staff');
    expect(homePathFor('GUEST')).toBe('/');
    expect(homePathFor(undefined)).toBe('/');
  });

  it('only allows same-origin paths as redirect targets', () => {
    expect(safeRedirect('/dashboard?tab=past')).toBe('/dashboard?tab=past');
    expect(safeRedirect('//evil.example')).toBeNull();
    expect(safeRedirect('/\\evil.example')).toBeNull();
    expect(safeRedirect('https://evil.example')).toBeNull();
    expect(safeRedirect('dashboard')).toBeNull();
    expect(safeRedirect('/login?next=/x')).toBeNull();
    expect(safeRedirect('/register')).toBeNull();
    expect(safeRedirect(null)).toBeNull();
  });

  it('builds the login URL with an encoded next parameter', () => {
    expect(loginPath('/book/3/7?x=1')).toBe('/login?next=%2Fbook%2F3%2F7%3Fx%3D1');
    expect(loginPath('//evil.example')).toBe('/login');
  });

  it('reads the post-login target from ?next= first, then router state', () => {
    expect(nextFromLocation({ search: '?next=%2Fprofile', state: { from: '/dashboard' } })).toBe('/profile');
    expect(nextFromLocation({ search: '', state: { from: '/dashboard' } })).toBe('/dashboard');
    expect(nextFromLocation({ search: '', state: { from: { pathname: '/providers', search: '?q=a' } } })).toBe('/providers?q=a');
    expect(nextFromLocation({ search: '?next=https%3A%2F%2Fevil.example' })).toBeNull();
  });
});

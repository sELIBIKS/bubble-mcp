import { describe, it, expect } from 'vitest';
import { extractBubbleCookies, validateSession } from '../../src/auth/browser-login.js';

describe('extractBubbleCookies', () => {
  it('filters only bubble.io domain cookies', () => {
    const allCookies = [
      { name: 'meta_u1main', value: 'user1', domain: '.bubble.io', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const },
      { name: '_ga', value: 'GA1.2', domain: '.google.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
      { name: 'NID', value: 'abc', domain: '.google.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' as const },
    ];
    const result = extractBubbleCookies(allCookies);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.domain === '.bubble.io')).toBe(true);
  });

  it('includes cookies from bubble.io domain without dot prefix', () => {
    const allCookies = [
      { name: 'editor_visits_count', value: '5', domain: 'bubble.io', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
      { name: 'meta_u1main', value: 'u1', domain: '.bubble.io', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
    ];
    const result = extractBubbleCookies(allCookies);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no bubble cookies present', () => {
    const result = extractBubbleCookies([
      { name: '_ga', value: 'x', domain: '.google.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
    ]);
    expect(result).toEqual([]);
  });
});

describe('validateSession', () => {
  it('returns true when required cookies are present', () => {
    const cookies = [
      { name: 'meta_u1main', value: 'user1', domain: '.bubble.io' },
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io' },
      { name: 'meta_live_u2main.sig', value: 'sig1', domain: '.bubble.io' },
    ];
    expect(validateSession(cookies)).toBe(true);
  });

  it('returns false when meta_u1main is missing', () => {
    const cookies = [
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io' },
    ];
    expect(validateSession(cookies)).toBe(false);
  });

  it('returns false for empty cookies', () => {
    expect(validateSession([])).toBe(false);
  });
});

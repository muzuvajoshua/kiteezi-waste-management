import { describe, it, expect } from 'vitest';
import { assertPasswordAcceptable, normaliseEmail, WeakPasswordError } from './password';

// Password policy. NIST SP 800-63B shaped: length is the control that
// matters, composition rules ("must contain a symbol") are not, and an upper
// bound exists purely so a megabyte-long password cannot be used to burn CPU.

describe('assertPasswordAcceptable', () => {
  it('accepts a reasonable passphrase', () => {
    expect(() => assertPasswordAcceptable('correct horse battery staple')).not.toThrow();
  });

  it('accepts exactly the minimum length', () => {
    expect(() => assertPasswordAcceptable('12345678')).not.toThrow();
  });

  it('rejects a password below the minimum length', () => {
    expect(() => assertPasswordAcceptable('1234567')).toThrow(WeakPasswordError);
  });

  it('rejects an empty password', () => {
    expect(() => assertPasswordAcceptable('')).toThrow(WeakPasswordError);
  });

  it('rejects a password beyond the maximum length', () => {
    // Not a strength rule: scrypt cost scales with input, so an unbounded
    // password is a cheap way to make the server do expensive work.
    expect(() => assertPasswordAcceptable('a'.repeat(1025))).toThrow(WeakPasswordError);
  });

  it('accepts exactly the maximum length', () => {
    expect(() => assertPasswordAcceptable('a'.repeat(1024))).not.toThrow();
  });

  it('does not impose composition rules', () => {
    // Deliberate: requiring symbols/digits pushes people toward "Password1!"
    // and is not what NIST recommends.
    expect(() => assertPasswordAcceptable('aaaaaaaaaaaaaaaa')).not.toThrow();
  });

  it('counts characters, not bytes, so a short multi-byte password is still short', () => {
    // '🔑'.repeat(4) is 8 UTF-16 units but only 4 characters.
    expect(() => assertPasswordAcceptable('🔑'.repeat(4))).toThrow(WeakPasswordError);
  });

  it('carries a stable domain code', () => {
    try {
      assertPasswordAcceptable('short');
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as WeakPasswordError).code).toBe('WEAK_PASSWORD');
    }
  });

  it('explains the requirement in its message', () => {
    expect(() => assertPasswordAcceptable('short')).toThrow(/8/);
  });
});

describe('normaliseEmail', () => {
  it('lowercases so casing cannot create a second account', () => {
    expect(normaliseEmail('Citizen@Example.COM')).toBe('citizen@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseEmail('  citizen@example.com  ')).toBe('citizen@example.com');
  });

  it('leaves an already-normal address alone', () => {
    expect(normaliseEmail('citizen@example.com')).toBe('citizen@example.com');
  });
});

import { describe, it, expect } from 'vitest';
import { clientIpFrom } from './client-identity';

// Extracting the caller's IP from proxy headers.
//
// This is security-relevant: the IP is a rate-limit key, so anything a client
// can control is something an attacker can rotate to get a fresh budget. The
// tests below pin which header wins and what happens when one is absent —
// see the implementation for the trust assumption this rests on.

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe('clientIpFrom', () => {
  describe('header precedence', () => {
    it('prefers x-real-ip, which the platform sets as a single value', () => {
      expect(
        clientIpFrom(headers({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.9' }))
      ).toBe('203.0.113.5');
    });

    it('falls back to x-forwarded-for when x-real-ip is absent', () => {
      expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
    });

    it('takes the first entry of a forwarded chain', () => {
      expect(
        clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' }))
      ).toBe('203.0.113.5');
    });

    it('trims whitespace around the entry', () => {
      expect(clientIpFrom(headers({ 'x-forwarded-for': '  203.0.113.5 , 70.41.3.18' }))).toBe(
        '203.0.113.5'
      );
    });
  });

  describe('when no usable header is present', () => {
    it('returns null rather than a placeholder', () => {
      // A shared placeholder like 'unknown' would put every header-less
      // caller in ONE bucket, so a single one could exhaust the budget for
      // all of them. Callers must decide what to do with null.
      expect(clientIpFrom(headers({}))).toBeNull();
    });

    it('returns null for an empty header value', () => {
      expect(clientIpFrom(headers({ 'x-forwarded-for': '' }))).toBeNull();
    });

    it('returns null when the header holds only separators', () => {
      expect(clientIpFrom(headers({ 'x-forwarded-for': ' , , ' }))).toBeNull();
    });
  });

  describe('bounds what it will return', () => {
    it('rejects an absurdly long value instead of using it as a key', () => {
      // Keys are stored in a varchar(255) column, and an attacker who can
      // choose the key can otherwise both break the insert and mint unlimited
      // distinct buckets.
      expect(clientIpFrom(headers({ 'x-forwarded-for': 'a'.repeat(300) }))).toBeNull();
    });

    it('accepts an IPv6 address', () => {
      expect(clientIpFrom(headers({ 'x-real-ip': '2001:db8::8a2e:370:7334' }))).toBe(
        '2001:db8::8a2e:370:7334'
      );
    });

    it('rejects a value containing characters no IP has', () => {
      expect(clientIpFrom(headers({ 'x-real-ip': 'not an ip; DROP TABLE' }))).toBeNull();
    });
  });
});

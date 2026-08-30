import { describe, it, expect } from 'vitest';
import { ScryptPasswordHasher } from './scrypt-password-hasher.adapter';

const hasher = new ScryptPasswordHasher();

describe('ScryptPasswordHasher', () => {
  describe('hashing', () => {
    it('verifies a password against its own hash', async () => {
      const encoded = await hasher.hash('correct horse battery staple');

      expect(await hasher.verify('correct horse battery staple', encoded)).toBe(true);
    });

    it('rejects the wrong password', async () => {
      const encoded = await hasher.hash('correct horse battery staple');

      expect(await hasher.verify('Correct horse battery staple', encoded)).toBe(false);
    });

    it('never stores the password itself', async () => {
      const encoded = await hasher.hash('correct horse battery staple');

      expect(encoded).not.toContain('correct horse battery staple');
    });

    it('produces a different hash each time, so equal passwords are not equal rows', async () => {
      // Per-hash random salt. Without it, identical passwords produce
      // identical hashes and the database itself reveals which users share one.
      const a = await hasher.hash('same password');
      const b = await hasher.hash('same password');

      expect(a).not.toBe(b);
      expect(await hasher.verify('same password', a)).toBe(true);
      expect(await hasher.verify('same password', b)).toBe(true);
    });

    // NOT covered here, and it cannot be: that the comparison is
    // constant-time. `timingSafeEqual` and a plain `===` are functionally
    // identical, so swapping one for the other passes every test in this file
    // (confirmed by mutation). Timing resistance is enforced by code review
    // and the comment at the call site, not by this suite — stated plainly so
    // nobody reads a green run as proof of it.
    it('handles unicode passwords', async () => {
      const encoded = await hasher.hash('пароль-🔑-密码');

      expect(await hasher.verify('пароль-🔑-密码', encoded)).toBe(true);
      expect(await hasher.verify('пароль-🔑-密碼', encoded)).toBe(false);
    });
  });

  describe('encoded format is self-describing', () => {
    it('records the algorithm and its parameters', async () => {
      // Parameters live in the hash so they can be raised later without
      // invalidating every existing password.
      const encoded = await hasher.hash('correct horse battery staple');
      const [scheme, n, r, p, salt, digest] = encoded.split('$');

      expect(scheme).toBe('scrypt');
      expect(Number(n)).toBe(65536);
      expect(Number(r)).toBe(8);
      expect(Number(p)).toBe(1);
      expect(salt.length).toBeGreaterThan(0);
      expect(digest.length).toBeGreaterThan(0);
    });

    it('verifies a hash made with different (weaker) parameters', async () => {
      // The upgrade path: an old row stored at a lower cost must keep working
      // after the default is raised, or raising it locks everyone out.
      const legacy = new ScryptPasswordHasher({ N: 16384, r: 8, p: 1 });
      const encoded = await legacy.hash('correct horse battery staple');

      expect(await hasher.verify('correct horse battery staple', encoded)).toBe(true);
    });
  });

  describe('malformed stored values fail closed', () => {
    for (const [label, value] of [
      ['empty string', ''],
      ['not an encoded hash', 'hunter2'],
      ['too few fields', 'scrypt$65536$8'],
      ['unknown scheme', 'bcrypt$65536$8$1$c2FsdA$aGFzaA'],
      ['non-numeric parameters', 'scrypt$abc$8$1$c2FsdA$aGFzaA'],
      ['empty salt', 'scrypt$65536$8$1$$aGFzaA'],
    ] as const) {
      it(`returns false for ${label} rather than throwing`, async () => {
        await expect(hasher.verify('correct horse battery staple', value)).resolves.toBe(false);
      });
    }

    it('returns false for absurd parameters instead of exhausting memory', async () => {
      // A corrupted or hostile row must not be able to make the server
      // allocate gigabytes trying to verify it.
      await expect(
        hasher.verify('correct horse battery staple', 'scrypt$1073741824$8$1$c2FsdA$aGFzaA')
      ).resolves.toBe(false);
    });
  });
});

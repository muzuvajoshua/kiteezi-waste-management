import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWK } from 'jose';
import { GoogleIdentityProvider, GOOGLE_ISSUERS } from './google-identity-provider.adapter';

// Security tests for the sign-in trust boundary. Carried over wholesale from
// web3auth-identity-provider.adapter.test.ts — the provider changed, the
// threat model did not — plus cases only Google makes possible.
//
// The adapter resolves keys from Google's published JWKS in production. These
// tests inject a LOCAL JWKS built from a key pair generated here: same code
// path, different key source, so no network call and no test-only branch.
//
// Unlike Web3Auth, Google publishes an OpenID discovery document, so the
// expected issuer is a documented constant rather than a value that had to be
// read off a live token. Issuer validation is therefore mandatory here — the
// WEB3AUTH_EXPECTED_ISSUER opt-out that #105 had to ship is gone.

const OUR_CLIENT_ID = '1234567890-abcdefg.apps.googleusercontent.com';
const OTHER_CLIENT_ID = '9999999999-zzzzzzz.apps.googleusercontent.com';

let signingPrivateKey: CryptoKey;
let foreignPrivateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeEach(async () => {
  const signing = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  signingPrivateKey = signing.privateKey;
  foreignPrivateKey = foreign.privateKey;

  const publicJwk = (await exportJWK(signing.publicKey)) as JWK;
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, alg: 'RS256', use: 'sig' }] });

  process.env.GOOGLE_OAUTH_CLIENT_ID = OUR_CLIENT_ID;
});

afterEach(() => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
});

/** Mints an RS256 ID token the way Google's OIDC endpoint does. */
async function mintToken(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; alg?: string; expiresIn?: string } = {}
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? 'RS256' })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(opts.key ?? signingPrivateKey);
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: OUR_CLIENT_ID,
    sub: '110248495921238986420',
    email: 'citizen@example.com',
    email_verified: true,
    name: 'Real Citizen',
    ...overrides,
  };
}

function subject() {
  return new GoogleIdentityProvider(jwks);
}

/**
 * Asserts a rejection carries a specific `jose` failure code (and, for claim
 * failures, the specific claim). A bare `.rejects.toThrow()` is not enough:
 * while the equivalent Web3Auth suite was being written it passed against the
 * *unfixed* adapter, because an un-injected remote JWKS happened to fail on
 * key ambiguity instead of on audience. Pinning the reason is what makes these
 * regression tests rather than "something went wrong" assertions.
 */
async function expectRejectionCode(
  promise: Promise<unknown>,
  code: string,
  claim?: string
): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error('Expected verifyToken to reject, but it resolved');
    },
    (caught: unknown) => caught as { code?: string; claim?: string }
  );
  expect(error.code).toBe(code);
  if (claim !== undefined) expect(error.claim).toBe(claim);
}

describe('GoogleIdentityProvider', () => {
  describe('accepts legitimate tokens', () => {
    it('returns the stable subject, email and name', async () => {
      const idToken = await mintToken(validClaims());

      await expect(subject().verifyToken(idToken)).resolves.toEqual({
        subject: '110248495921238986420',
        email: 'citizen@example.com',
        emailVerified: true,
        name: 'Real Citizen',
      });
    });

    it('accepts the alternate documented issuer', async () => {
      // Google stamps either 'https://accounts.google.com' or the
      // scheme-less 'accounts.google.com'; both are legitimate and both
      // appear in the wild, so both must verify.
      const idToken = await mintToken(validClaims({ iss: 'accounts.google.com' }));

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        subject: '110248495921238986420',
      });
    });

    it('exposes both accepted issuers as a constant', () => {
      expect(GOOGLE_ISSUERS).toContain('https://accounts.google.com');
      expect(GOOGLE_ISSUERS).toContain('accounts.google.com');
    });

    it('accepts a token whose aud is an array containing this application', async () => {
      const idToken = await mintToken(validClaims({ aud: [OTHER_CLIENT_ID, OUR_CLIENT_ID] }));

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        subject: '110248495921238986420',
      });
    });
  });

  describe('subject is required', () => {
    it('rejects a token with no sub claim', async () => {
      // Without a stable subject there is nothing safe to key an account on,
      // and falling back to email would reintroduce exactly the weakness this
      // adapter exists to remove.
      const claims = validClaims();
      delete (claims as Record<string, unknown>).sub;
      const idToken = await mintToken(claims);

      await expect(subject().verifyToken(idToken)).rejects.toThrow(/sub/i);
    });

    it('rejects a token whose sub is an empty string', async () => {
      const idToken = await mintToken(validClaims({ sub: '' }));

      await expect(subject().verifyToken(idToken)).rejects.toThrow(/sub/i);
    });
  });

  describe('audience binding', () => {
    // REGRESSION TEST. Google's JWKS is shared across every Google OAuth
    // client, so signature verification alone proves only "Google issued
    // this", not "issued for us". A token minted for any other Google app
    // would otherwise authenticate here.
    it('rejects a validly signed token minted for a different Google client', async () => {
      const crossAppToken = await mintToken(validClaims({ aud: OTHER_CLIENT_ID }));

      await expectRejectionCode(
        subject().verifyToken(crossAppToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'aud'
      );
    });

    it('rejects a token with no aud claim at all', async () => {
      const claims = validClaims();
      delete (claims as Record<string, unknown>).aud;
      const idToken = await mintToken(claims);

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'aud'
      );
    });

    it('fails closed when the client id is not configured', async () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      const idToken = await mintToken(validClaims());

      await expect(subject().verifyToken(idToken)).rejects.toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
    });

    it('fails closed when the client id is blank', async () => {
      process.env.GOOGLE_OAUTH_CLIENT_ID = '   ';
      const idToken = await mintToken(validClaims());

      await expect(subject().verifyToken(idToken)).rejects.toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
    });
  });

  describe('issuer binding', () => {
    it('rejects a token from an impostor issuer', async () => {
      const idToken = await mintToken(validClaims({ iss: 'https://accounts.google.com.evil.test' }));

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'iss'
      );
    });

    it('rejects a token with no iss claim', async () => {
      const claims = validClaims();
      delete (claims as Record<string, unknown>).iss;
      const idToken = await mintToken(claims);

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'iss'
      );
    });
  });

  describe('email verification state is reported, not assumed', () => {
    it('reports emailVerified false when Google says the address is unverified', async () => {
      const idToken = await mintToken(validClaims({ email_verified: false }));

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        emailVerified: false,
      });
    });

    it('reports emailVerified false when the claim is absent', async () => {
      // Absent must not read as verified — the caller decides what to do with
      // an unverified address, but it must never be told "verified" by default.
      const claims = validClaims();
      delete (claims as Record<string, unknown>).email_verified;
      const idToken = await mintToken(claims);

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        emailVerified: false,
      });
    });

    it('coerces a string "true" from the claim to a boolean', async () => {
      // Some OIDC providers stringify this claim; the port promises a boolean.
      const idToken = await mintToken(validClaims({ email_verified: 'true' }));

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        emailVerified: true,
      });
    });
  });

  describe('signature, algorithm and format', () => {
    it('rejects a token signed by a key outside the trusted JWKS', async () => {
      const idToken = await mintToken(validClaims(), { key: foreignPrivateKey });

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
      );
    });

    it('rejects a token whose payload was tampered with after signing', async () => {
      const idToken = await mintToken(validClaims());
      const [header, , signature] = idToken.split('.');
      const forged = Buffer.from(
        JSON.stringify(validClaims({ email: 'admin@kiteezi.example' }))
      ).toString('base64url');

      await expectRejectionCode(
        subject().verifyToken(`${header}.${forged}.${signature}`),
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
      );
    });

    it('rejects an expired token', async () => {
      const idToken = await mintToken(validClaims(), { expiresIn: '-1m' });

      await expectRejectionCode(subject().verifyToken(idToken), 'ERR_JWT_EXPIRED');
    });

    it('rejects a malformed token', async () => {
      await expectRejectionCode(subject().verifyToken('not-a-jwt'), 'ERR_JWS_INVALID');
    });

    it('rejects an empty token', async () => {
      await expectRejectionCode(subject().verifyToken(''), 'ERR_JWS_INVALID');
    });

    it('rejects an unsigned (alg=none) token', async () => {
      const unsecured = [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify(validClaims())).toString('base64url'),
        '',
      ].join('.');

      await expectRejectionCode(subject().verifyToken(unsecured), 'ERR_JOSE_ALG_NOT_ALLOWED');
    });

    it('rejects an HS256 token (algorithm confusion)', async () => {
      const hmac = await new SignJWT(validClaims())
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('a'.repeat(32)));

      await expectRejectionCode(subject().verifyToken(hmac), 'ERR_JOSE_ALG_NOT_ALLOWED');
    });
  });

  describe('port contract', () => {
    it('throws rather than resolving null on failure', async () => {
      await expect(subject().verifyToken('not-a-jwt')).rejects.toBeInstanceOf(Error);
    });
  });
});

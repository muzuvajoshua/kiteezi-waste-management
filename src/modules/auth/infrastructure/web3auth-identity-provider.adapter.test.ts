import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type JWK } from 'jose';
import { Web3AuthIdentityProvider } from './web3auth-identity-provider.adapter';

// Security tests for the sign-in trust boundary (see docs/security/web3auth-token-validation.md).
//
// The real adapter resolves keys from Web3Auth's remote JWKS. These tests
// instead build a LOCAL JWKS from a key pair generated here, injected via the
// constructor. That is the same code path production takes — only the key
// source differs — so no network call, no real Web3Auth account, and no
// test-only branch inside the adapter is required. Every assertion below is
// about the adapter's *validation* logic, which is what the vulnerability
// lived in.

const OUR_CLIENT_ID = 'BJ-our-app-client-id';
const ATTACKER_CLIENT_ID = 'BJ-some-other-web3auth-app';
const ISSUER = 'https://api-auth.web3auth.io';

// Generated once per test file: `signingKeys` are published in the JWKS the
// adapter trusts; `foreignKeys` are not, so tokens they sign must fail.
let signingPrivateKey: CryptoKey;
let foreignPrivateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeEach(async () => {
  const signing = await generateKeyPair('ES256');
  const foreign = await generateKeyPair('ES256');
  signingPrivateKey = signing.privateKey;
  foreignPrivateKey = foreign.privateKey;

  const publicJwk = (await exportJWK(signing.publicKey)) as JWK;
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, alg: 'ES256', use: 'sig' }] });

  process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID = OUR_CLIENT_ID;
  delete process.env.WEB3AUTH_EXPECTED_ISSUER;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID;
  delete process.env.WEB3AUTH_EXPECTED_ISSUER;
});

/** Mints an ES256 token the way Web3Auth's social-login flow does. */
async function mintToken(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; alg?: string; expiresIn?: string } = {}
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? 'ES256' })
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(opts.key ?? signingPrivateKey);
}

function subject() {
  return new Web3AuthIdentityProvider(jwks);
}

/**
 * Asserts a rejection carries a specific `jose` failure code (and, for claim
 * failures, the specific claim). A bare `.rejects.toThrow()` is not enough
 * here: while this suite was being written it passed against the *unfixed*
 * adapter, because the un-injected remote JWKS happened to fail on key
 * ambiguity instead. Pinning the reason is what makes these real regression
 * tests rather than "something went wrong" assertions.
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

describe('Web3AuthIdentityProvider', () => {
  describe('accepts legitimate tokens', () => {
    it('returns the email and name claims for a token minted for this application', async () => {
      const idToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
        name: 'Real Citizen',
      });

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        email: 'citizen@example.com',
        name: 'Real Citizen',
      });
    });

    it('accepts a token whose aud is an array containing this application', async () => {
      // RFC 7519 §4.1.3 permits `aud` to be an array; jose matches membership.
      const idToken = await mintToken({
        aud: [ATTACKER_CLIENT_ID, OUR_CLIENT_ID],
        iss: ISSUER,
        email: 'citizen@example.com',
      });

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        email: 'citizen@example.com',
      });
    });
  });

  describe('audience binding (the vulnerability this suite exists to prevent)', () => {
    // REGRESSION TEST. Before audience validation, this token — correctly
    // signed by Web3Auth's real shared JWKS but minted for a DIFFERENT
    // Web3Auth application — was accepted, and establish-session trusted its
    // `email` claim to select-or-create any user. Removing the `audience`
    // option from the adapter must make this test fail.
    it('rejects a validly signed token minted for a different Web3Auth application', async () => {
      const crossAppToken = await mintToken({
        aud: ATTACKER_CLIENT_ID,
        iss: ISSUER,
        email: 'admin@kiteezi.example',
        name: 'Impersonated Admin',
      });

      // Must fail specifically on the `aud` claim — proving the audience
      // check did the rejecting, not the signature or key lookup.
      await expectRejectionCode(
        subject().verifyToken(crossAppToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'aud'
      );
    });

    it('rejects a token with no aud claim at all', async () => {
      const idToken = await mintToken({ iss: ISSUER, email: 'citizen@example.com' });

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'aud'
      );
    });

    it('fails closed when the client id is not configured, rather than skipping the audience check', async () => {
      // A missing env var must never silently degrade to "accept any
      // audience" — that would quietly reintroduce the vulnerability in any
      // environment where the variable was forgotten.
      delete process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID;
      const otherwiseValidToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
      });

      await expect(subject().verifyToken(otherwiseValidToken)).rejects.toThrow(
        /NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID/
      );
    });

    it('fails closed when the client id is set to an empty string', async () => {
      process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID = '';
      const otherwiseValidToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
      });

      await expect(subject().verifyToken(otherwiseValidToken)).rejects.toThrow(
        /NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID/
      );
    });
  });

  describe('issuer binding', () => {
    it('rejects a token from an unexpected issuer when an expected issuer is configured', async () => {
      process.env.WEB3AUTH_EXPECTED_ISSUER = ISSUER;
      const idToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: 'https://impostor.example.com',
        email: 'citizen@example.com',
      });

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'iss'
      );
    });

    it('accepts a token from the expected issuer when one is configured', async () => {
      process.env.WEB3AUTH_EXPECTED_ISSUER = ISSUER;
      const idToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
      });

      await expect(subject().verifyToken(idToken)).resolves.toMatchObject({
        email: 'citizen@example.com',
      });
    });

    it('still enforces the audience when no expected issuer is configured', async () => {
      // Issuer validation is opt-in (the exact Web3Auth issuer string is
      // deployment-specific); leaving it unset must not weaken the audience
      // check, which is the control that actually pins a token to this app.
      const crossAppToken = await mintToken({
        aud: ATTACKER_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
      });

      await expectRejectionCode(
        subject().verifyToken(crossAppToken),
        'ERR_JWT_CLAIM_VALIDATION_FAILED',
        'aud'
      );
    });
  });

  describe('signature, algorithm and format', () => {
    it('rejects a token signed by a key outside the trusted JWKS', async () => {
      const idToken = await mintToken(
        { aud: OUR_CLIENT_ID, iss: ISSUER, email: 'citizen@example.com' },
        { key: foreignPrivateKey }
      );

      await expectRejectionCode(
        subject().verifyToken(idToken),
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
      );
    });

    it('rejects a token whose payload was tampered with after signing', async () => {
      const idToken = await mintToken({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'citizen@example.com',
      });
      const [header, , signature] = idToken.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ aud: OUR_CLIENT_ID, iss: ISSUER, email: 'admin@kiteezi.example' })
      ).toString('base64url');

      await expectRejectionCode(
        subject().verifyToken(`${header}.${forgedPayload}.${signature}`),
        'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
      );
    });

    it('rejects an expired token', async () => {
      const idToken = await mintToken(
        { aud: OUR_CLIENT_ID, iss: ISSUER, email: 'citizen@example.com' },
        { expiresIn: '-1m' }
      );

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
        Buffer.from(
          JSON.stringify({ aud: OUR_CLIENT_ID, iss: ISSUER, email: 'admin@kiteezi.example' })
        ).toString('base64url'),
        '',
      ].join('.');

      await expectRejectionCode(subject().verifyToken(unsecured), 'ERR_JOSE_ALG_NOT_ALLOWED');
    });

    it('rejects a token signed with a non-ES256 algorithm', async () => {
      // Algorithm confusion: the JWKS publishes ES256 keys only, so an HS256
      // token must be refused on the algorithm restriction alone.
      const hmacToken = await new SignJWT({
        aud: OUR_CLIENT_ID,
        iss: ISSUER,
        email: 'admin@kiteezi.example',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('a'.repeat(32)));

      await expectRejectionCode(subject().verifyToken(hmacToken), 'ERR_JOSE_ALG_NOT_ALLOWED');
    });
  });

  describe('port contract', () => {
    it('throws rather than resolving null on failure, per IdentityProvider', async () => {
      // establish-session.usecase.ts distinguishes a thrown verification
      // failure (-> UNAUTHENTICATED) from later infrastructure faults
      // (-> UNEXPECTED). Resolving a null/undefined here instead of throwing
      // would misroute a bad credential as a server error.
      await expect(subject().verifyToken('not-a-jwt')).rejects.toBeInstanceOf(Error);
    });
  });
});

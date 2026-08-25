import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { IdentityProvider } from '../application/ports/identity-provider.port';

// Social-login (SAPPHIRE) ID tokens issued by Web3Auth are ES256 JWTs signed
// by this JWKS. createRemoteJWKSet caches and rotates keys internally and is
// lazy — constructing it issues no network request.
const WEB3AUTH_JWKS_URL = 'https://api-auth.web3auth.io/jwks';

const web3AuthJwks = createRemoteJWKSet(new URL(WEB3AUTH_JWKS_URL));

/**
 * The audience a Web3Auth ID token must carry: this application's Web3Auth
 * client id — the same value `Web3AuthProvider.tsx` constructs the SDK with.
 *
 * Read lazily (the composition root builds this adapter at module scope, and
 * `next build` must not require runtime config), and **fail closed**: without
 * a client id there is no audience to bind to, so verification must refuse
 * rather than fall back to accepting any audience. That fallback is precisely
 * the vulnerability this check exists to close.
 *
 * `NEXT_PUBLIC_`-prefixed by necessity — the browser needs the same value to
 * initialise the SDK. It is a public identifier, not a secret.
 */
function requiredAudience(): string {
  const clientId = process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      'NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID is not set; refusing to verify a Web3Auth ID token without an expected audience'
    );
  }
  return clientId;
}

/**
 * The issuer a token must carry, when one is configured.
 *
 * Optional by deliberate design. The exact `iss` string Web3Auth stamps is not
 * derivable from this repository or from the provider: the SDK ships no such
 * constant, and `api-auth.web3auth.io` publishes no OpenID discovery document
 * to read it from. Hard-coding a guess would break every sign-in if wrong, for
 * little gain — the JWKS URL above is already pinned, so only Web3Auth's own
 * keys can produce a valid signature, and the audience check already binds a
 * token to this application.
 *
 * Set WEB3AUTH_EXPECTED_ISSUER to switch this on once the value is confirmed
 * from a real token; enforcement is implemented and tested either way. See
 * docs/security/web3auth-token-validation.md.
 */
function optionalIssuer(): string | undefined {
  return process.env.WEB3AUTH_EXPECTED_ISSUER?.trim() || undefined;
}

export class Web3AuthIdentityProvider implements IdentityProvider {
  /**
   * @param keyResolver resolves the signing key for a token. Defaults to
   * Web3Auth's remote JWKS; tests inject a local JWKS built from a generated
   * key pair so the validation rules can be exercised without a network call.
   */
  constructor(private readonly keyResolver: JWTVerifyGetKey = web3AuthJwks) {}

  // Still throws on an invalid token, per the IdentityProvider port: an
  // unverifiable external credential during sign-in is a genuine failure to
  // report, not a routine "no session" outcome. establish-session.usecase.ts
  // maps the throw to UNAUTHENTICATED.
  async verifyToken(idToken: string): Promise<{ email?: string; name?: string }> {
    const audience = requiredAudience();
    const issuer = optionalIssuer();

    const { payload } = await jwtVerify(idToken, this.keyResolver, {
      algorithms: ['ES256'],
      audience,
      ...(issuer ? { issuer } : {}),
    });

    return payload as { email?: string; name?: string };
  }
}

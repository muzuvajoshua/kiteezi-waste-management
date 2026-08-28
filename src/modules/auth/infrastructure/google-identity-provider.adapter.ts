import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type {
  IdentityProvider,
  ExternalIdentity,
} from '../application/ports/identity-provider.port';

// Google OIDC ID-token verification. Replaces Web3AuthIdentityProvider.
//
// Every value below comes from Google's published OpenID discovery document
// (https://accounts.google.com/.well-known/openid-configuration), which is the
// substantive improvement over Web3Auth: that provider publishes no discovery
// document at all, so its expected issuer could not be established from any
// authoritative source and issuer validation had to ship behind an opt-in env
// var (see the deleted docs/security/web3auth-token-validation.md §3). Here
// the issuer is documented, so it is enforced unconditionally.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Google stamps `iss` as either form; both are legitimate and both occur.
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/**
 * The audience an ID token must carry: this application's Google OAuth client
 * id, which is what binds a token to *us*. Google's JWKS is shared across
 * every Google OAuth client, so a valid signature proves only "Google issued
 * this", never "issued for this application".
 *
 * Read lazily so `next build` needs no runtime config, and **fails closed**:
 * without a client id there is no audience to check, and silently accepting
 * any audience is precisely the vulnerability this exists to prevent.
 *
 * Server-only (no NEXT_PUBLIC_ prefix). The browser needs the client id too,
 * but it gets its own NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID — the verifier must
 * not depend on a browser-exposed variable.
 */
function requiredAudience(): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID is not set; refusing to verify a Google ID token without an expected audience'
    );
  }
  return clientId;
}

/**
 * Google sends `email_verified` as a boolean, but some OIDC providers
 * stringify it. Anything that is not explicitly true reads as false: an absent
 * or unrecognised claim must never be reported as verified, because callers
 * use this to decide whether an address is safe to link an account by.
 */
function toEmailVerified(claim: unknown): boolean {
  return claim === true || claim === 'true';
}

export class GoogleIdentityProvider implements IdentityProvider {
  /**
   * @param keyResolver resolves the signing key for a token. Defaults to
   * Google's published JWKS; tests inject a local JWKS built from a generated
   * key pair so the validation rules run without a network call.
   */
  constructor(private readonly keyResolver: JWTVerifyGetKey = googleJwks) {}

  // Throws on an invalid token, per the IdentityProvider port:
  // establish-session maps the throw to UNAUTHENTICATED.
  async verifyToken(idToken: string): Promise<ExternalIdentity> {
    const { payload } = await jwtVerify(idToken, this.keyResolver, {
      algorithms: ['RS256'],
      audience: requiredAudience(),
      issuer: [...GOOGLE_ISSUERS],
    });

    // `sub` is what accounts are keyed on, so its absence is fatal rather
    // than something to paper over with an email fallback.
    const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!subject) {
      throw new Error('Google ID token has no usable sub claim');
    }

    return {
      subject,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: toEmailVerified(payload.email_verified),
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  }
}

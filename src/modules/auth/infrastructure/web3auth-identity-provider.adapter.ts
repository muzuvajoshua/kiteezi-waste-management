import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IdentityProvider } from '../application/ports/identity-provider.port';

// Social-login (SAPPHIRE) ID tokens issued by Web3Auth are ES256 JWTs signed
// by this JWKS. createRemoteJWKSet caches and rotates keys internally.
// Relocated from lib/web3auth.ts, unchanged: still throws on an invalid
// token (an unverifiable external credential during sign-in is a genuine
// failure to report, not a routine "no session" outcome).
const JWKS = createRemoteJWKSet(new URL('https://api-auth.web3auth.io/jwks'));

export class Web3AuthIdentityProvider implements IdentityProvider {
  async verifyToken(idToken: string): Promise<{ email?: string; name?: string }> {
    const { payload } = await jwtVerify(idToken, JWKS, { algorithms: ['ES256'] });
    return payload as { email?: string; name?: string };
  }
}

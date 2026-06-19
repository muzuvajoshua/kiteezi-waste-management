import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Social-login (SAPPHIRE) ID tokens issued by Web3Auth are ES256 JWTs signed
// by this JWKS. createRemoteJWKSet caches and rotates keys internally.
const JWKS = createRemoteJWKSet(new URL("https://api-auth.web3auth.io/jwks"));

export interface Web3AuthTokenClaims extends JWTPayload {
  email?: string;
  name?: string;
  verifier?: string;
  verifierId?: string;
}

/**
 * Verifies a Web3Auth ID token against the public JWKS.
 * Throws if the signature is invalid, the token is expired, or the algorithm
 * does not match — callers map any throw to a 401.
 */
export async function verifyWeb3AuthToken(
  idToken: string
): Promise<Web3AuthTokenClaims> {
  const { payload } = await jwtVerify(idToken, JWKS, { algorithms: ["ES256"] });
  return payload as Web3AuthTokenClaims;
}

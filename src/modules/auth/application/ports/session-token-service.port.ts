// Port: sign/verify the session token. `verify` never throws — an
// invalid/expired/tampered token is an expected outcome, resolved to `null`
// rather than propagated as a fault (see the jose adapter's docstring for
// why this specific contract matters).
export interface SessionTokenService {
  sign(payload: { userId: number }): Promise<string>;
  verify(token: string): Promise<{ userId: number } | null>;
}

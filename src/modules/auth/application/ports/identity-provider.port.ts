// Port: verifies an external identity token (Web3Auth today) and returns
// its claims. Unlike SessionTokenService.verify, this throws on an invalid
// token — an unverifiable *external* credential during sign-in is treated
// as a genuine failure to report, not a routine "no session" outcome.
export interface IdentityProvider {
  verifyToken(idToken: string): Promise<{ email?: string; name?: string }>;
}

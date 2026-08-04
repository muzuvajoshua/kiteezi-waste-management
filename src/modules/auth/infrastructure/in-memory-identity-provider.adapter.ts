import type { IdentityProvider } from '../application/ports/identity-provider.port';

export class InMemoryIdentityProvider implements IdentityProvider {
  private readonly claimsByToken = new Map<string, { email?: string; name?: string }>();

  seedToken(idToken: string, claims: { email?: string; name?: string }): void {
    this.claimsByToken.set(idToken, claims);
  }

  async verifyToken(idToken: string): Promise<{ email?: string; name?: string }> {
    const claims = this.claimsByToken.get(idToken);
    if (!claims) throw new Error('Invalid token');
    return claims;
  }
}

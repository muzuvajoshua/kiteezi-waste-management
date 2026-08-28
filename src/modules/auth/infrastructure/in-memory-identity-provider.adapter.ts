import type {
  IdentityProvider,
  ExternalIdentity,
} from '../application/ports/identity-provider.port';

export class InMemoryIdentityProvider implements IdentityProvider {
  private readonly identitiesByToken = new Map<string, ExternalIdentity>();

  seedToken(idToken: string, identity: ExternalIdentity): void {
    this.identitiesByToken.set(idToken, identity);
  }

  async verifyToken(idToken: string): Promise<ExternalIdentity> {
    const identity = this.identitiesByToken.get(idToken);
    if (!identity) throw new Error('Invalid token');
    return identity;
  }
}

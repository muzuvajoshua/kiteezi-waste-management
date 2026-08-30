import type { AuthProvider } from '../domain/auth-provider';
import type {
  IdentityRepository,
  IdentityRecord,
  LinkIdentityInput,
} from '../application/ports/identity-repository.port';

export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly byKey = new Map<string, IdentityRecord>();

  private static key(provider: AuthProvider, providerSubject: string): string {
    return `${provider}:${providerSubject}`;
  }

  async findByProviderSubject(
    provider: AuthProvider,
    providerSubject: string
  ): Promise<IdentityRecord | null> {
    return this.byKey.get(InMemoryIdentityRepository.key(provider, providerSubject)) ?? null;
  }

  async link(input: LinkIdentityInput): Promise<IdentityRecord> {
    const record: IdentityRecord = {
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      passwordHash: input.passwordHash ?? null,
    };
    // Mirrors the DB's unique(provider, provider_subject): a second link for
    // the same pair is a programming error, not a silent overwrite.
    const key = InMemoryIdentityRepository.key(input.provider, input.providerSubject);
    if (this.byKey.has(key)) {
      throw new Error(`Identity already linked: ${key}`);
    }
    this.byKey.set(key, record);
    return record;
  }

  async updatePasswordHash(userId: number, passwordHash: string): Promise<boolean> {
    let updated = false;
    for (const [key, record] of this.byKey) {
      if (record.userId === userId && record.provider === 'password') {
        this.byKey.set(key, { ...record, passwordHash });
        updated = true;
      }
    }
    return updated;
  }
}

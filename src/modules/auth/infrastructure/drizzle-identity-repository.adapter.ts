import { and, eq } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { UserIdentities } from '@/utils/db/schema';
import type { AuthProvider } from '../domain/auth-provider';
import type {
  IdentityRepository,
  IdentityRecord,
  LinkIdentityInput,
} from '../application/ports/identity-repository.port';

// Backed by the plain http client: neither query needs a transaction. The
// unique(provider, provider_subject) constraint is what actually guarantees
// one identity maps to one user — a race between two concurrent first
// sign-ins for the same subject fails at the database rather than quietly
// creating a second account.
export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Database) {}

  async findByProviderSubject(
    provider: AuthProvider,
    providerSubject: string
  ): Promise<IdentityRecord | null> {
    const [row] = await this.db
      .select({
        userId: UserIdentities.userId,
        provider: UserIdentities.provider,
        providerSubject: UserIdentities.providerSubject,
        passwordHash: UserIdentities.passwordHash,
      })
      .from(UserIdentities)
      .where(
        and(
          eq(UserIdentities.provider, provider),
          eq(UserIdentities.providerSubject, providerSubject)
        )
      )
      .execute();

    return row ?? null;
  }

  async link(input: LinkIdentityInput): Promise<IdentityRecord> {
    const [row] = await this.db
      .insert(UserIdentities)
      .values({
        userId: input.userId,
        provider: input.provider,
        providerSubject: input.providerSubject,
        passwordHash: input.passwordHash ?? null,
      })
      .returning({
        userId: UserIdentities.userId,
        provider: UserIdentities.provider,
        providerSubject: UserIdentities.providerSubject,
        passwordHash: UserIdentities.passwordHash,
      })
      .execute();

    return row;
  }

  async updatePasswordHash(userId: number, passwordHash: string): Promise<boolean> {
    const updated = await this.db
      .update(UserIdentities)
      .set({ passwordHash })
      .where(and(eq(UserIdentities.userId, userId), eq(UserIdentities.provider, 'password')))
      .returning({ userId: UserIdentities.userId })
      .execute();

    return updated.length > 0;
  }
}

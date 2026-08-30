import type { AuthProvider } from '../../domain/auth-provider';

export interface IdentityRecord {
  readonly userId: number;
  readonly provider: AuthProvider;
  readonly providerSubject: string;
  /** Only ever present for provider 'password'. */
  readonly passwordHash: string | null;
}

export interface LinkIdentityInput {
  readonly userId: number;
  readonly provider: AuthProvider;
  readonly providerSubject: string;
  readonly passwordHash?: string | null;
}

// Port: how a person proves who they are, decoupled from who they are.
//
// Split from UserRepository deliberately. A user is a profile (id, email,
// name); an identity is a credential that resolves to one. Keeping them apart
// is what lets one user hold both a Google identity and a password identity
// without UserRepository growing provider-specific methods.
export interface IdentityRepository {
  findByProviderSubject(
    provider: AuthProvider,
    providerSubject: string
  ): Promise<IdentityRecord | null>;

  link(input: LinkIdentityInput): Promise<IdentityRecord>;

  /**
   * Replaces the stored password hash for a user's password identity.
   *
   * Keyed on userId rather than the address, because a reset is authorised by
   * a token that resolves to a user — never by a caller-supplied email, which
   * would let whoever holds one token rewrite a different account's password.
   *
   * Returns false when the user has no password identity to update. The
   * caller needs that signal: a token resolving to a user who no longer has
   * one must be reported, not treated as a silent success that tells the
   * person their password changed when nothing did.
   */
  updatePasswordHash(userId: number, passwordHash: string): Promise<boolean>;
}

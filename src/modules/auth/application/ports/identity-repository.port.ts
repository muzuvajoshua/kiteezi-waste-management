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
}

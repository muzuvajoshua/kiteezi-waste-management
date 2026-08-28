import type { Role } from './role';

// The resolved identity + roles for the current request. A plain read
// snapshot — no class, no behavior of its own (the actual authorization
// decisions live in authorization-policy.ts, which operates ON this data
// rather than the data owning them).
export interface CurrentUser {
  readonly userId: number;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly Role[];
}

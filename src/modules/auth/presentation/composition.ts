import { DrizzleUserRepository } from '../infrastructure/drizzle-user-repository.adapter';
import { DrizzleRoleRepository } from '../infrastructure/drizzle-role-repository.adapter';
import { CookieSessionStore } from '../infrastructure/cookie-session-store.adapter';
import { JoseSessionTokenService } from '../infrastructure/jose-session-token.adapter';
import { GoogleIdentityProvider } from '../infrastructure/google-identity-provider.adapter';
import { DrizzleIdentityRepository } from '../infrastructure/drizzle-identity-repository.adapter';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher.adapter';

// This module's slice of the composition root: module-scope singletons,
// same lazy/cheap-construction pattern as db/txdb and the rewards module's
// composition.ts. The session lifetime is a policy fact consumed only by
// two Infrastructure adapters (JWT `exp`, cookie `Max-Age`) — owned here,
// the one place that already constructs and threads both of them, rather
// than duplicated as a literal in each adapter or given its own Domain file.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const userRepository = new DrizzleUserRepository();
export const roleRepository = new DrizzleRoleRepository();
export const sessionStore = new CookieSessionStore(SESSION_MAX_AGE_SECONDS);
export const sessionTokenService = new JoseSessionTokenService(SESSION_MAX_AGE_SECONDS);
export const identityProvider = new GoogleIdentityProvider();
export const identityRepository = new DrizzleIdentityRepository();
// Default scrypt parameters, chosen in the adapter. Constructed here like
// every other adapter so the cost is set in one place if it is ever raised.
export const passwordHasher = new ScryptPasswordHasher();

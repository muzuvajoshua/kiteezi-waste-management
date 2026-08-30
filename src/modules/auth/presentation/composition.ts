import { SESSION_MAX_AGE_SECONDS } from '../domain/session';
import { DrizzleUserRepository } from '../infrastructure/drizzle-user-repository.adapter';
import { DrizzleRoleRepository } from '../infrastructure/drizzle-role-repository.adapter';
import { CookieSessionStore } from '../infrastructure/cookie-session-store.adapter';
import { JoseSessionTokenService } from '../infrastructure/jose-session-token.adapter';
import { GoogleIdentityProvider } from '../infrastructure/google-identity-provider.adapter';
import { DrizzleIdentityRepository } from '../infrastructure/drizzle-identity-repository.adapter';
import { DrizzleSessionRepository } from '../infrastructure/drizzle-session-repository.adapter';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher.adapter';
import { Sha256ResetTokenService } from '../infrastructure/sha256-reset-token.adapter';
import { DrizzlePasswordResetTokenRepository } from '../infrastructure/drizzle-password-reset-token-repository.adapter';

// This module's slice of the composition root: module-scope singletons,
// same lazy/cheap-construction pattern as db/txdb and the rewards module's
// composition.ts.
//
// The session lifetime moved to domain/session.ts when KWM-079 added session
// records: a third consumer appeared (the record's expires_at, set by a
// use-case), so keeping the literal here would have meant threading it down
// from the composition root or duplicating it.

export const userRepository = new DrizzleUserRepository();
export const roleRepository = new DrizzleRoleRepository();
export const sessionStore = new CookieSessionStore(SESSION_MAX_AGE_SECONDS);
export const sessionTokenService = new JoseSessionTokenService(SESSION_MAX_AGE_SECONDS);
export const identityProvider = new GoogleIdentityProvider();
export const identityRepository = new DrizzleIdentityRepository();
export const sessionRepository = new DrizzleSessionRepository();
// Default scrypt parameters, chosen in the adapter. Constructed here like
// every other adapter so the cost is set in one place if it is ever raised.
export const passwordHasher = new ScryptPasswordHasher();
export const resetTokenService = new Sha256ResetTokenService();
export const passwordResetTokenRepository = new DrizzlePasswordResetTokenRepository();

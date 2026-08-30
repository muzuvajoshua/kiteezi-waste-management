"use server";

import { headers } from 'next/headers';
import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
import { clientIpFrom } from '@/shared/presentation/client-identity';
import { enforceRateLimit, RATE_LIMITS } from '@/shared/presentation/rate-limit';
import { rateLimiter } from '@/shared/presentation/composition';
import { normaliseEmail } from '../domain/password';
import type { Result } from '@/shared/application/result';
import type { AppError } from '@/shared/application/app-error';
import {
  passwordHasher,
  identityRepository,
  userRepository,
  roleRepository,
  sessionTokenService,
  sessionStore,
} from './composition';
import { registerWithPassword } from '../application/register-with-password.usecase';
import { establishSessionFromPassword } from '../application/establish-session-from-password.usecase';
import { registerSchema, passwordSignInSchema } from './password.schemas';

export interface AuthenticatedUser {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

// Email/password sign-up and sign-in, as server actions rather than route
// handlers. The Google flow uses /api/auth/session because Google Identity
// Services POSTs a token to it from the browser; these have no such
// constraint, so they follow the pattern every other mutation in this
// codebase uses — actionResult, Result<T, AppError>, never throwing.
//
// No auth guard: these ARE the authentication. They are the only actions in
// the codebase without requireUser/requireRole, which is why they are
// separated from the guarded ones rather than mixed among them.
//
// Rate limited per KWM-054. Sign-in is limited per EMAIL more tightly than
// per IP: the email is what an attacker cannot rotate while still attacking
// one account, whereas addresses are cheap. See shared/presentation/rate-limit.ts.
//
// Limits are applied AFTER validation, so the key is the normalised address
// rather than whatever was typed. An attacker sending input that fails
// validation therefore consumes no budget — but that path costs only a Zod
// parse, never a scrypt hash, so it buys them nothing.

export async function registerWithEmailPassword(
  email: string,
  password: string,
  name?: string
): Promise<Result<AuthenticatedUser, AppError>> {
  return actionResult(async () => {
    const input = validate(registerSchema, { email, password, name });

    // Per-IP only: there is no account to protect yet, and limiting per
    // submitted email would let an attacker mint unlimited buckets by varying
    // the address — the opposite of a limit.
    await enforceRateLimit(rateLimiter, [
      {
        scope: 'register:ip',
        id: clientIpFrom(await headers()),
        policy: RATE_LIMITS.registerPerIp,
      },
    ]);

    return registerWithPassword(
      passwordHasher,
      identityRepository,
      userRepository,
      roleRepository,
      sessionTokenService,
      sessionStore,
      { email: input.email, password: input.password, name: input.name }
    );
  });
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<Result<AuthenticatedUser, AppError>> {
  return actionResult(async () => {
    const input = validate(passwordSignInSchema, { email, password });

    await enforceRateLimit(rateLimiter, [
      {
        scope: 'signIn:email',
        id: normaliseEmail(input.email),
        policy: RATE_LIMITS.signInPerEmail,
      },
      { scope: 'signIn:ip', id: clientIpFrom(await headers()), policy: RATE_LIMITS.signInPerIp },
    ]);

    return establishSessionFromPassword(
      passwordHasher,
      identityRepository,
      userRepository,
      sessionTokenService,
      sessionStore,
      { email: input.email, password: input.password }
    );
  });
}

"use server";

import { validate } from '@/lib/validation';
import { actionResult } from '@/shared/presentation/action-result';
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
// ⚠️ NOT RATE LIMITED. Sign-in is the classic credential-stuffing target and
// nothing here throttles attempts — scrypt's ~240ms cost raises the price of
// an attack but does not bound it. KWM-054 (#64) must land before this is
// exposed to real users.

export async function registerWithEmailPassword(
  email: string,
  password: string,
  name?: string
): Promise<Result<AuthenticatedUser, AppError>> {
  return actionResult(async () => {
    const input = validate(registerSchema, { email, password, name });

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

import { z } from 'zod';
import { MAX_PASSWORD_LENGTH } from '../domain/password';

// Input schemas for the password actions.
//
// These validate SHAPE, not policy. The minimum-length rule lives in
// domain/password.ts and is enforced there — duplicating it here would be two
// sources of truth that drift, and the domain is the one that must hold
// regardless of which entry point is used.
//
// The maximum IS enforced here as well, deliberately: it is the DoS bound, so
// it has to reject before the value reaches a hashing function, not after.

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .max(255)
  // Deliberately permissive. Exhaustive email regexes reject valid addresses
  // (RFC 5322 allows far more than people expect), and the only real proof an
  // address works is sending to it — which is KWM-059's job, not this one.
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address');

const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(255).optional(),
});

export const passwordSignInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

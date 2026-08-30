import { z } from 'zod';
import { MAX_PASSWORD_LENGTH } from '../domain/password';

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').max(255),
});

export const resetPasswordSchema = z.object({
  // Bounded, not pattern-matched: the token's validity is decided by looking
  // up its hash, and a length cap is enough to stop an absurd value reaching
  // the hash function.
  token: z.string().trim().min(1, 'Reset token is required').max(512),
  newPassword: z.string().min(1, 'Password is required').max(MAX_PASSWORD_LENGTH),
});

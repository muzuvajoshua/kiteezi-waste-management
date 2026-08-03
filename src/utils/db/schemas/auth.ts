import { z } from 'zod';

// KWM-017 — request body schema for POST /api/auth/session.
export const sessionRequestSchema = z.object({
  idToken: z.string().trim().min(1).max(4096),
});

import { z } from 'zod';

// KWM-017 — request body schema for POST /api/auth/session. Relocated from
// utils/db/schemas/auth.ts as part of the auth module extraction; content
// unchanged.
export const sessionRequestSchema = z.object({
  idToken: z.string().trim().min(1).max(4096),
});

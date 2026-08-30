import { DrizzleRateLimiter } from '@/shared/infrastructure/rate-limit/drizzle-rate-limiter.adapter';
import type { RateLimiter } from '@/shared/application/ports/rate-limiter.port';

// Shared slice of the composition root, for adapters no single module owns.
//
// The Drizzle limiter is used in every environment including development.
// The in-memory one is accurate only in a single process, and quietly
// swapping implementations by environment would mean the limits are never
// exercised until production — where getting them wrong locks people out.
export const rateLimiter: RateLimiter = new DrizzleRateLimiter();

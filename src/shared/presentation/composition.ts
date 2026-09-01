import { DrizzleRateLimiter } from '@/shared/infrastructure/rate-limit/drizzle-rate-limiter.adapter';
import { ResendEmailSender } from '@/shared/infrastructure/email/resend-email-sender.adapter';
import { ConsoleEmailSender } from '@/shared/infrastructure/email/console-email-sender.adapter';
import type { RateLimiter } from '@/shared/application/ports/rate-limiter.port';
import type { EmailSender } from '@/shared/application/ports/email-sender.port';
import { DrizzleAuditLogger } from '@/shared/infrastructure/audit/drizzle-audit-logger.adapter';
import type { AuditLogger } from '@/shared/application/ports/audit-logger.port';

// Shared slice of the composition root, for adapters no single module owns.
//
// The Drizzle limiter is used in every environment including development.
// The in-memory one is accurate only in a single process, and quietly
// swapping implementations by environment would mean the limits are never
// exercised until production — where getting them wrong locks people out.
export const rateLimiter: RateLimiter = new DrizzleRateLimiter();

// Transport is chosen by an EXPLICIT variable, never inferred from NODE_ENV.
// A transport that silently swallows mail based on an ambient value is one
// misconfiguration away from a production outage nobody notices, because
// every send keeps returning success. Set EMAIL_TRANSPORT=console for local
// development, where there is no Resend key; anything else sends for real.
export const emailSender: EmailSender =
  process.env.EMAIL_TRANSPORT === 'console' ? new ConsoleEmailSender() : new ResendEmailSender();

// KWM-078. The audit_log table and its helper shipped in June (KWM-016) and
// nothing ever called them, so the log was guaranteed empty — anyone reading
// the schema would wrongly conclude an audit trail existed. This is what
// makes it real.
export const auditLogger: AuditLogger = new DrizzleAuditLogger();

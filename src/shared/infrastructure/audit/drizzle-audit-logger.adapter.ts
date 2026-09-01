import { db } from '@/utils/db/dbConfig';
import { AuditLog } from '@/utils/db/schema';
import type { AuditLogger, AuditEntry } from '@/shared/application/ports/audit-logger.port';

// Writes to the `audit_log` table added by migration 0003 (KWM-016). That
// table and its helper shipped in June and were never called by anything —
// the log was guaranteed empty, so anyone reading the schema would wrongly
// conclude an audit trail existed. This adapter and KWM-078's call sites are
// what make it real.
//
// Relocated from utils/db/audit.ts behind a port, because a server action
// importing that file pulled in dbConfig — and its eager
// neon(process.env.DATABASE_URL!) throws at import time, which is precisely
// what made actions untestable before the composition seam existed.
export class DrizzleAuditLogger implements AuditLogger {
  async record(entry: AuditEntry): Promise<void> {
    try {
      await db
        .insert(AuditLog)
        .values({
          actorUserId: entry.actorUserId,
          action: entry.action,
          target: entry.target,
          before: entry.before ?? null,
          after: entry.after ?? null,
        })
        .execute();
    } catch (error) {
      // Never rethrown: auditing must not break the action it records. The
      // failure is logged so it is visible to operators even though the user
      // sees a success.
      console.error('Failed to write audit entry:', error);
    }
  }
}

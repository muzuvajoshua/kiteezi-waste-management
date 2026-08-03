import { db } from './dbConfig';
import { AuditLog } from './schema';

/**
 * KWM-016 — append an entry to the audit log.
 *
 * Captures a privileged mutation: who performed it (`actorUserId`, nullable for
 * system / unauthenticated actions), what `action` was taken, the `target` it
 * was taken against (e.g. `"report:42"`), and the entity snapshots `before` and
 * `after` the change. `requestId` correlates the entry with a request trace.
 *
 * Designed to be called from every privileged server action. Once server-side
 * sessions land (KWM-004) the caller can source `actorUserId` from
 * `getServerSession()` and `requestId` from the incoming request.
 */
export interface AuditParams {
  actorUserId?: number | null;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

export async function audit(params: AuditParams) {
  const { actorUserId = null, action, target, before, after, requestId = null } = params;
  try {
    const [entry] = await db
      .insert(AuditLog)
      .values({
        actorUserId: actorUserId ?? null,
        action,
        target,
        before: before ?? null,
        after: after ?? null,
        requestId: requestId ?? null,
      })
      .returning()
      .execute();
    return entry;
  } catch (error) {
    // Auditing must never break the action it records; log and continue.
    console.error('Error writing audit log entry:', error);
    return null;
  }
}

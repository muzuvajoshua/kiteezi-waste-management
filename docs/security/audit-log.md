# Audit log

**Issue:** KWM-078 (#108), completing KWM-016 (#23)
**Port:** [`audit-logger.port.ts`](../../src/shared/application/ports/audit-logger.port.ts)
**Table:** `audit_log`, from migration `0003`

---

## 1. What was wrong

The `audit_log` table, its index and an `audit()` helper shipped in June under KWM-016. **Nothing ever called them.**

```
$ grep -rn 'audit(' src --include=*.ts | grep -v 'utils/db/audit.ts'
(no matches)
```

The table was guaranteed empty, and KWM-016 was closed — so anyone reading the schema, or the issue tracker, would reasonably conclude the application kept an audit trail. It did not. That is worse than having none, because it invites reliance.

## 2. What is recorded

| Action | When | Actor | Target |
|---|---|---|---|
| `report.status.updated` | a supervisor/admin changes a report's status | session user | `report:<id>` |
| `report.task.updated` | an operator claims or advances a task | session user | `report:<id>` |
| `reward.points.granted` | **points minted onto another user's balance** | session user | `user:<recipient>` |
| `reward.redeemed` | a user spends their balance | session user | `user:<self>` |
| `collection.recorded` | a collection is recorded against a report | session user | `report:<id>` |
| `collection.verified` | a collection is verified | session user | `report:<id>` |

`reward.points.granted` is the one that matters most: it is the only operation where one account creates value on another. Its target is the **recipient**, not the actor, because "who received value" is the question the trail exists to answer.

## 3. What is deliberately *not* recorded

**Reads.** They are not mutations and would drown the signal.

**Refused attempts.** A caller the guards rejected performed no mutation. Failed authorization is a separate concern with a separate home; mixing them fills the trail with noise.

**No-ops.** A `saveReward` replayed with the same idempotency key applies once. Recording twice would read as two grants and overstate what happened — there is a test for this.

**`before` snapshots, for report status.** The schema supports them and they are genuinely useful, but neither status write path reads the current row first (see `domain/report.ts`), and adding a read purely to enrich the log would reshape the write path for a nice-to-have. Worth revisiting with **KWM-081**, whose transition rules need the prior status anyway.

## 4. Fail-open, deliberately

`record` never throws. An audit failure is logged server-side and the action succeeds.

That is a choice, and the wrong one for systems where the audit trail is a compliance artefact. Here it is operational: a citizen's waste report being refused because the audit table is unavailable would be a worse outcome than an unrecorded report.

**If this ever needs to become "no record, no action", the change belongs in the port contract** — one place — not scattered across six call sites.

## 5. Why it went behind a port

The original `audit()` imported `dbConfig` directly. A server action importing it would pull in `neon(process.env.DATABASE_URL!)`, which throws at module load — the exact wall that made actions untestable until the composition seam existed.

So this was not architectural preference: calling the old helper from an action would have broken every action test. `utils/db/audit.ts` is deleted; `DrizzleAuditLogger` replaces it behind `AuditLogger`.

## 6. Testing

12 cases pinning the **wiring**, not the logger. Deleting a `record(...)` call leaves the logger's own behaviour intact and every other suite green — the same gap the authorization and rate-limit suites exist to close.

**Mutation-verified:**

| Sabotage | Failures |
|---|---|
| remove auditing from `updateReportStatus` | 3 |
| attribute the entry to an argument instead of the session | 2 |
| audit even when the mutation did not happen | 1 |
| record a second entry for an idempotent replay | 1 |
| name the actor as the grant target | 2 |
| let an audit failure break the action | 1 |

The third row initially **survived**, and the reason is worth keeping: asserting only "no entry was written" passed even with the guard removed, because building an entry from a missing report threw, and the throw prevented the write. Right outcome, wrong reason. The test now also asserts the action still returns `ok(null)`, which pins the guard itself.

## 7. Known gaps

- **`requestId` is not populated.** The column exists. Correlating an entry with a request trace needs request-scoped context that does not exist yet — it belongs with observability (KWM-071).
- **Session revocation is not audited.** Terminating someone's sessions is exactly the sort of privileged act this is for, but `revokeUserSessions` has no UI caller yet (KWM-079 §6), so there is no real event to record.
- **Role grants are not audited.** Roles are currently granted by hand in SQL; when an admin UI exists, that is the next thing to record.
- **Nothing reads the log.** Entries accumulate with no way to view them short of querying Postgres. An admin view is the obvious follow-up.
- **No retention policy.** Unlike the rate-limit counters and reset tokens, audit entries should probably be kept — but "forever" should be a decision, not an accident.

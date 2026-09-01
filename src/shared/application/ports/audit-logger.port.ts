export interface AuditEntry {
  /** Who did it. Null only for system actions with no signed-in actor. */
  readonly actorUserId: number | null;
  /** What was done, as a stable dotted name: 'report.status.updated'. */
  readonly action: string;
  /** What it was done to: 'report:42', 'user:7'. */
  readonly target: string;
  /** State before the change, where the caller has it. */
  readonly before?: unknown;
  /** State after the change. */
  readonly after?: unknown;
}

// Port: append-only record of privileged mutations.
//
// `record` NEVER throws. Auditing must not break the action it describes — a
// waste report failing because the audit table is full would be a worse
// outcome than an unrecorded report. Failures are logged server-side instead.
//
// That is a deliberate fail-OPEN choice and the wrong one for systems where
// the audit trail is a compliance artefact rather than an operational one. If
// this application ever needs "no record, no action", the change belongs here
// in the port contract, not scattered through the call sites.
export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

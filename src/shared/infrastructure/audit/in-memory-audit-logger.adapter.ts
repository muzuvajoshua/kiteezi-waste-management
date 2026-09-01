import type { AuditLogger, AuditEntry } from '@/shared/application/ports/audit-logger.port';

export class InMemoryAuditLogger implements AuditLogger {
  readonly entries: AuditEntry[] = [];
  private failure: Error | null = null;

  async record(entry: AuditEntry): Promise<void> {
    // Mirrors the real adapter's contract: a failure is swallowed, so a test
    // can prove the action still succeeds when auditing breaks.
    if (this.failure) {
      console.error('Failed to write audit entry:', this.failure);
      return;
    }
    this.entries.push(entry);
  }

  failWith(error: Error): void {
    this.failure = error;
  }

  find(action: string): AuditEntry | undefined {
    return this.entries.find((e) => e.action === action);
  }

  clear(): void {
    this.entries.length = 0;
    this.failure = null;
  }
}

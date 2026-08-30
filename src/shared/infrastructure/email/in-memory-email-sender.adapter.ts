import type { EmailSender, EmailMessage } from '@/shared/application/ports/email-sender.port';

// Captures messages instead of sending them, so a test can assert what a user
// would actually receive — including that a reset link is present and correct.
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private failure: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.sent.push(message);
  }

  /** Makes the next and all subsequent sends throw, for failure-path tests. */
  failWith(error: Error): void {
    this.failure = error;
  }

  get lastMessage(): EmailMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  clear(): void {
    this.sent.length = 0;
    this.failure = null;
  }
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /**
   * Plain-text body. Required, not optional: a text part is what screen
   * readers, text-only clients and spam filters read, and an HTML-only
   * message is both less accessible and more likely to be filtered.
   */
  readonly text: string;
  readonly html?: string;
}

// Port: delivers a transactional email.
//
// Throws on failure, like the repository adapters — the caller decides
// whether a failed send is fatal. For password reset it deliberately is not
// (see request-password-reset.usecase.ts), because failing loudly there would
// tell an attacker which addresses exist.
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

import type { EmailSender, EmailMessage } from '@/shared/application/ports/email-sender.port';

// Writes the message to the server log instead of sending it.
//
// For local development, where there is no Resend key and no verified sender
// domain. A password-reset link is unusable if it is only ever emailed, so
// printing it is what makes the flow testable by hand — the alternative is
// developers commenting out the send, which ends up committed.
//
// Selected explicitly by EMAIL_TRANSPORT=console, never inferred from
// NODE_ENV: a transport that silently swallows mail based on an ambient
// variable is one misconfiguration away from a production outage nobody
// notices, because everything keeps returning success.
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        '',
        '--- transactional email (console transport, not sent) ---',
        `to:      ${message.to}`,
        `subject: ${message.subject}`,
        '',
        message.text,
        '--- end ---',
        '',
      ].join('\n')
    );
  }
}

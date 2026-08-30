import type { EmailSender, EmailMessage } from '@/shared/application/ports/email-sender.port';

// Resend's HTTP API, called with fetch.
//
// No SDK: the API is one authenticated POST, and the official package is a
// thin wrapper around exactly this request. Skipping it keeps the dependency
// count at zero — the same reasoning that chose Node's built-in scrypt over
// argon2 and a Google script tag over three @web3auth packages.
//
// ⚠️ NEVER EXERCISED AGAINST THE LIVE API. There is no Resend account or key
// in this environment, so the tests stub fetch and assert the request this
// builds, not that Resend accepts it. Sending one real email is the
// outstanding verification — see docs/security/transactional-email.md.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Read per send rather than at module load: a missing key must fail the send,
 * not the build. Same discipline as SESSION_SECRET and GOOGLE_OAUTH_CLIENT_ID.
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set; cannot send transactional email`);
  }
  return value;
}

export class ResendEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const apiKey = requiredEnv('RESEND_API_KEY');
    const from = requiredEnv('EMAIL_FROM');

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        // Spread so the key is absent rather than explicitly undefined: some
        // providers render a blank HTML part in place of the text one when
        // sent an empty value.
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      // Deliberately without the recipient address: these failures are logged,
      // and a log aggregator should not accumulate user addresses from routine
      // bounces.
      throw new Error(`Resend rejected the message with status ${response.status}`);
    }
  }
}

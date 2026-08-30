import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResendEmailSender } from './resend-email-sender.adapter';

// Resend's HTTP API, called with fetch — no SDK, so no dependency.
//
// `fetch` is stubbed rather than called: these assert the request WE build and
// how we treat each response. They cannot prove Resend accepts it, and the
// adapter has never run against the live API (no key here) — see the PR and
// docs/security for that limitation stated plainly.

const MESSAGE = {
  to: 'citizen@example.com',
  subject: 'Reset your password',
  text: 'Follow the link.',
};

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown = { id: 'abc' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Kiteezi <no-reply@kiteezi.example>';
  fetchMock = vi.fn().mockResolvedValue(respond(200));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

function subject() {
  return new ResendEmailSender();
}

describe('ResendEmailSender', () => {
  describe('the request it builds', () => {
    it('posts to the Resend messages endpoint', async () => {
      await subject().send(MESSAGE);

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    });

    it('authenticates with the API key as a bearer token', async () => {
      await subject().send(MESSAGE);

      const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('sends the configured from address, recipient, subject and text', async () => {
      await subject().send(MESSAGE);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        from: 'Kiteezi <no-reply@kiteezi.example>',
        to: 'citizen@example.com',
        subject: 'Reset your password',
        text: 'Follow the link.',
      });
    });

    it('omits html entirely when none is given', async () => {
      // Sending `html: undefined` would serialise to a missing key anyway, but
      // an explicit null or empty string can make a provider render a blank
      // HTML part in place of the text one.
      await subject().send(MESSAGE);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('html');
    });

    it('includes html when supplied', async () => {
      await subject().send({ ...MESSAGE, html: '<p>Follow the link.</p>' });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).html).toBe('<p>Follow the link.</p>');
    });
  });

  describe('configuration', () => {
    it('fails when the API key is missing rather than silently not sending', async () => {
      delete process.env.RESEND_API_KEY;

      await expect(subject().send(MESSAGE)).rejects.toThrow(/RESEND_API_KEY/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails when the from address is missing', async () => {
      delete process.env.EMAIL_FROM;

      await expect(subject().send(MESSAGE)).rejects.toThrow(/EMAIL_FROM/);
    });

    it('reads configuration per send, not once at import', async () => {
      // Read at module load, a missing key would crash the build rather than
      // the send — the same lazy-read discipline the auth adapters use.
      const sender = subject();
      await sender.send(MESSAGE);
      process.env.EMAIL_FROM = 'Changed <other@kiteezi.example>';

      await sender.send(MESSAGE);

      expect(JSON.parse(fetchMock.mock.calls[1][1].body).from).toBe(
        'Changed <other@kiteezi.example>'
      );
    });
  });

  describe('when the provider refuses', () => {
    it('throws on a 4xx', async () => {
      fetchMock.mockResolvedValue(respond(422, { message: 'Invalid `to` field' }));

      await expect(subject().send(MESSAGE)).rejects.toThrow(/422/);
    });

    it('throws on a 5xx', async () => {
      fetchMock.mockResolvedValue(respond(503, { message: 'unavailable' }));

      await expect(subject().send(MESSAGE)).rejects.toThrow(/503/);
    });

    it('does not put the recipient address in the thrown message', async () => {
      // Send failures are logged server-side. Keeping the address out of the
      // message means a log aggregator does not accumulate user addresses
      // from routine bounces.
      fetchMock.mockResolvedValue(respond(422, { message: 'bad' }));

      await subject()
        .send(MESSAGE)
        .catch((error: Error) => {
          expect(error.message).not.toContain('citizen@example.com');
        });
    });

    it('propagates a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(subject().send(MESSAGE)).rejects.toThrow();
    });
  });
});

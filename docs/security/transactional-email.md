# Transactional email and password reset

**Issues:** KWM-059 (email), and the reset hole left open by #119
**Sender:** [`resend-email-sender.adapter.ts`](../../src/shared/infrastructure/email/resend-email-sender.adapter.ts)
**Flow:** [`request-password-reset.usecase.ts`](../../src/modules/auth/application/request-password-reset.usecase.ts) · [`reset-password.usecase.ts`](../../src/modules/auth/application/reset-password.usecase.ts)

---

## 1. ⚠️ What has never been verified

**No email has ever been sent.** There is no Resend account or API key in this environment, so the adapter's tests stub `fetch` and assert the request *we build* — not that Resend accepts it.

Before this is relied on, someone must:

- [ ] Create a Resend account and API key.
- [ ] Verify a sender domain and publish **SPF and DKIM** (and ideally DMARC). Without these, mail is rejected or silently filtered — and silent filtering is the failure mode you will not notice, because every send still returns success.
- [ ] Set `RESEND_API_KEY`, `EMAIL_FROM` and `NEXT_PUBLIC_APP_URL`, and leave `EMAIL_TRANSPORT` unset.
- [ ] Send one real reset and confirm the link works end to end.

That is the DNS half of KWM-059's acceptance criteria, and it is dashboard work this PR cannot do.

## 2. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_TRANSPORT` | no | `console` prints messages to the server log instead of sending. Anything else sends via Resend. |
| `RESEND_API_KEY` | unless console | Server-only API key. |
| `EMAIL_FROM` | unless console | From address; its domain must be verified. |
| `NEXT_PUBLIC_APP_URL` | **yes** | Absolute base URL used to build the reset link. |

**Transport is explicit, never inferred from `NODE_ENV`.** A transport that swallows mail based on an ambient variable is one misconfiguration away from a production outage nobody notices, because every send keeps returning success.

**The link is built from `NEXT_PUBLIC_APP_URL`, never the request's `Host` header.** Trusting `Host` would let an attacker trigger a genuine Kiteezi email carrying a link to a site they control.

## 3. How reset works

```
/forgot-password  → requestPasswordResetAction
                  → find password identity by normalised email
                  → mint 256-bit token, store SHA-256 of it, email the raw token
/reset-password?token=…
                  → resetPasswordAction
                  → look up by hash, check unused + unexpired
                  → validate the new password, hash with scrypt, store
                  → mark used, invalidate every other outstanding token
```

## 4. Security properties, and why each exists

| Property | Why |
|---|---|
| **Identical response for known and unknown addresses** | Otherwise the form is an account enumerator — and unlike sign-in, it needs no password to probe. |
| **A failed send still reports success** | A send error is only reachable for an address that *does* exist, so surfacing it leaks the same fact. |
| **Only the SHA-256 of the token is stored** | A database leak would otherwise hand over a working reset link for every pending request. |
| **SHA-256, not scrypt** | The token is 256 bits of CSPRNG output. There is nothing to brute-force, so a slow KDF adds latency and no security. Passwords are the opposite case and correctly use scrypt. |
| **Single use (`used_at`)** | Without it a link stays live for its whole lifetime — anyone later reading the mailbox, a forwarded copy, or a proxy log can reset again. |
| **One-hour expiry** | Long enough for a slow mail hop and a phone read later; short enough that a stale link stops being a credential. |
| **A successful reset invalidates every other outstanding token** | An attacker who requested a reset must not keep a live link after the owner changes the password. |
| **All bad-token outcomes report identically** | Distinguishing unknown from expired from used tells an attacker whether a guessed token ever existed. |
| **The token is never rendered into the page** | It is a credential; rendering puts it into screenshots and screen-shares. |
| **`/reset-password` is `noindex, nofollow`** | A crawler following the link would consume the single-use token. |
| **Rate limited per email and per IP** | Reset-link spam aimed at one inbox, and token guessing from one source. |

### The accepted cost

A user whose email genuinely fails to send is told to check their inbox and finds nothing. That is the price of the identical-response rule. The alternative — reporting the failure — reveals which addresses are registered to anyone who asks.

Send failures **are** logged server-side, so the problem is visible to operators even though it is invisible to the user.

## 5. Known gaps

- **No email verification at registration.** A password account's address is unconfirmed. Google sign-ins carry `email_verified` from the provider; password registrations have no equivalent. Reset partially compensates (it proves mailbox control) but does not replace it.
- **No cleanup of expired tokens.** Rows accumulate. Same gap as the rate-limit counters — needs KWM-058 or a scheduled sweep.
- **A reset does not invalidate existing sessions.** Someone signed in with the old password stays signed in. That is KWM-079 (#109), which is about session revocation generally.
- **No "your password was changed" notification.** Worth adding: it is how a victim finds out about an unauthorised reset.
- **Migration 0008 is not applied anywhere** (KWM-068), so none of this has run against a real database.

## 6. Testing

27 use-case cases plus 12 adapter cases, mutation-verified:

| Sabotage | Failures |
|---|---|
| reveal that the address is unknown | 2 |
| store the raw token instead of its hash | 2 |
| allow a token to be reused | 3 |
| ignore expiry | 1 |
| skip invalidating other outstanding tokens | 1 |
| use a constant token instead of random | 1 |

Reset tests run against the **real** scrypt hasher and the **real** token service. A fake hasher would let "stored the password verbatim" pass; a fake token service would let a hashing mistake pass.

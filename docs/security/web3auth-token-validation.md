# Web3Auth ID-token validation

**Owner:** repository maintainer
**Audience:** anyone changing the sign-in path or configuring a new environment
**Code:** [`src/modules/auth/infrastructure/web3auth-identity-provider.adapter.ts`](../../src/modules/auth/infrastructure/web3auth-identity-provider.adapter.ts)
**Tests:** [`web3auth-identity-provider.adapter.test.ts`](../../src/modules/auth/infrastructure/web3auth-identity-provider.adapter.test.ts)

This is the application's **outermost trust boundary**. Everything downstream —
the session cookie, `requireUser()`, `requireRole()`, ownership checks — trusts
whatever this adapter returns. A token accepted here becomes an authenticated
user.

---

## 1. Where this sits in the sign-in path

```
browser: Web3Auth SDK sign-in
  → getUserInfo().idToken                       (Web3AuthProvider.tsx)
  → POST /api/auth/session { idToken }
      → sessionRequestSchema (Zod)              (auth.schemas.ts)
      → IdentityProvider.verifyToken(idToken)   ◀── THIS BOUNDARY
      → user upsert by email claim, default role 'citizen'
      → session JWT signed with SESSION_SECRET  (jose-session-token.adapter.ts)
      → HTTP-only cookie set                    (cookie-session-store.adapter.ts)
  → subsequent requests authenticated from the cookie alone
```

The `email` claim in the verified token selects **or creates** the user. That is
why audience binding matters: a token accepted here can name any email.

---

## 2. What is validated

| Check | Enforced | How |
|---|---|---|
| Signature | Always | Web3Auth JWKS at `https://api-auth.web3auth.io/jwks` (pinned URL) |
| Algorithm | Always | `ES256` only — rejects `alg: none` and HMAC confusion |
| Expiry (`exp`) | Always | `jose` default |
| **Audience (`aud`)** | **Always** | Must equal `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` |
| Issuer (`iss`) | When configured | Must equal `WEB3AUTH_EXPECTED_ISSUER`, if that variable is set |

### Audience is mandatory and fails closed

Without an audience check, a token minted for **any other Web3Auth
application** is signed by the same shared JWKS and therefore passes signature
verification. It would be accepted, and its `email` claim honoured — allowing
sign-in as an arbitrary user of this system.

If `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` is missing or blank, `verifyToken` throws
instead of skipping the check. A forgotten environment variable must never
silently downgrade to "accept any audience", which would quietly reintroduce
the vulnerability. Sign-in failing loudly is the correct outcome.

### Issuer is opt-in, by deliberate design

The exact `iss` string Web3Auth stamps on social-login tokens **could not be
established from this repository or from the provider**:

- the `@web3auth/*` packages ship no such constant (verified by grep);
- `https://api-auth.web3auth.io/.well-known/openid-configuration` returns
  **HTTP 404** — there is no discovery document to read it from;
- the JWKS response itself carries no issuer;
- no sample token is committed to the repo.

Hard-coding a guess would break every sign-in if wrong, in exchange for little:
the JWKS URL is already pinned (so only Web3Auth's keys can sign) and the
audience check already binds a token to this application. Issuer validation is
therefore **defence in depth**, implemented and tested, activated by config.

---

## 3. Enabling issuer validation

1. Sign in to the running app in a browser.
2. In DevTools, read the ID token: `await web3auth.getUserInfo()` → `idToken`.
3. Decode the payload — **do not paste the token into an online JWT decoder**,
   it is a live credential. Locally:
   ```bash
   node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" "<idToken>"
   ```
4. Read the `iss` value, and confirm `aud` equals your client id.
5. Set it in the environment (Vercel project env, and local `.env`):
   ```
   WEB3AUTH_EXPECTED_ISSUER='<the iss value>'
   ```
6. Re-run sign-in and confirm it still succeeds.

Rollback is removing the variable. Enforcement is covered by tests either way,
so this is a configuration change, not a code change.

---

## 4. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` | **Yes, for sign-in** | The expected `aud`. Also initialises the browser SDK. Public identifier, not a secret — but sign-in fails without it. |
| `WEB3AUTH_EXPECTED_ISSUER` | No | The expected `iss`. Unset = issuer not checked. Server-only; deliberately not `NEXT_PUBLIC_`. |

`next build` does **not** require either: config is read lazily inside
`verifyToken`, which never runs at build time. CI builds with neither variable
set and passes. Never print or commit these values.

---

## 5. Testing approach

The adapter's constructor takes an optional `JWTVerifyGetKey`, defaulting to the
real remote JWKS. Tests inject a **local** JWKS built from an ES256 key pair
generated in the test file, so the validation rules are exercised with no
network call, no Web3Auth account, and no test-only branch in production code.
Only the key *source* differs from production; the validation path is identical.

Covered: valid token · `aud` array form · cross-application `aud` (the
regression test) · missing `aud` · missing/blank client id · wrong `iss` ·
correct `iss` · foreign signing key · post-signing tamper · expired ·
malformed · empty · `alg: none` · HS256 confusion · port contract.

Negative tests assert the **specific** `jose` failure code (and claim), not just
"it threw". This matters: an earlier draft of the suite passed against the
unfixed adapter, because the un-injected remote JWKS happened to fail on key
ambiguity rather than on audience. Pinning the reason is what makes these
regression tests instead of "something went wrong" assertions.

To confirm the suite still guards the vulnerability, delete the `audience`
option from the adapter — exactly three audience-binding tests must fail.

---

## 6. Known gaps (not addressed here)

- **Logout does not invalidate the session server-side.** The session cookie is
  a stateless JWT valid for its 7-day `exp`; clearing the cookie does not revoke
  a copy already captured. Tracked in the current-state report §5.8.
- **No `nonce` / replay protection** on the sign-in token beyond `exp`.
- **The session route is unrate-limited** (KWM-054).

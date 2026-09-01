# Setup runbook — database, Google sign-in, email, deployment

Takes the repository from "builds and tests pass" to "a real person can sign in and submit a report". Covers **KWM-068** (Neon), **KWM-067** (Vercel), **KWM-005** (secrets), **KWM-059** (email DNS) and **KWM-080** (#110, verifying the token claims).

Everything here is account and dashboard work. No code changes are required.

---

## Before you start

**Do it locally first.** Every phase can be done against a local `next dev` before touching Vercel. Errors are visible in your terminal instead of a serverless log, and a mistake costs nothing. Production comes last, in Phase 6.

**Order is not arbitrary.** Sessions, rate limiting and reset tokens all write to the database, so nothing works before Phase 1. You cannot make yourself an admin until you have signed in once, which needs Google working. Phases 1 → 4 are a chain; Phase 5 is independent.

**What you will need:** a Neon account, a Google Cloud account, and — for Phase 5 only — a Resend account. A domain is required only to send mail to anyone other than yourself; Phase 5 covers the no-domain path too.

| Phase | What | Time | Blocks |
|---|---|---|---|
| 1 | Neon database | ~10 min | everything |
| 2 | Local env + migrations | ~10 min | everything |
| 3 | Google OAuth | ~20 min | sign-in |
| 4 | First sign-in, make yourself admin | ~10 min | admin features |
| 5 | Resend + DNS | ~20 min + DNS wait | password reset |
| 6 | Vercel production | ~15 min | the deployed site |
| 7 | Verify the token claims (#110) | ~5 min | — |

---

## Phase 1 — Find your existing Neon database

**A Neon database already exists.** Two things in this repository say so: `docs/db/migrations.md` describes `0000_baseline.sql` as safe to replay "against the already-provisioned database", and `scripts/reward-migration-check.mjs` — which connects and runs real queries — notes that "the production DB is empty". Someone ran that.

So this phase is *finding* the connection string, not creating one.

> **Where the confusion came from.** KWM-068 (#78) is titled "Provision Neon **branches**: dev / staging / prod with PITR ≥ 14 days". That is about branch structure and backup retention, not about whether a database exists. The two are easy to conflate — and an absent `DATABASE_URL` in a local `.env` says nothing about what exists remotely.

1. Get the string from wherever it already lives — **Vercel → Settings → Environment Variables**, or the Neon console under your existing project.
2. If you genuinely have no project: <https://console.neon.tech> → **New Project**, named `kiteezi`, region closest to Kampala (`eu-central-1` is usually the best available).

**⚠️ Take the POOLED string.** Neon offers two, and the difference matters:

| String | Host contains | Use for |
|---|---|---|
| **Pooled** | `-pooler` | `DATABASE_URL` — what the app uses |
| Direct | no `-pooler` | fallback if `db:migrate` misbehaves |

The app needs the pooler: `src/utils/db/txClient.ts` opens WebSocket transactions against it for the reward ledger, and its comments assume that endpoint.

It looks like:

```
postgresql://USER:PASSWORD@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

4. Copy it somewhere safe for the next phase. **Treat it as a password** — it contains one.

> **On branches (KWM-068 also asks for dev/staging/prod).** Skip for now. One database is right until something is actually deployed and being used; adding branches before that is ceremony. Revisit at Phase 6 if you want preview deployments isolated from production data.

---

## Phase 2 — Local environment and migrations

### 2.1 Create `.env`

Your `.env` currently holds only the two dead Web3Auth variables. Replace it:

```bash
cp .env.example .env
```

Then fill in:

```bash
DATABASE_URL='<the pooled string from Phase 1>'
SESSION_SECRET='<generate it — see below>'
EMAIL_TRANSPORT='console'
NEXT_PUBLIC_APP_URL='http://localhost:3000'
```

Generate the session secret — do not invent one by hand:

```bash
openssl rand -base64 32
```

That value signs every session cookie. **Changing it later signs everyone out.** Leave the Google and Resend variables as placeholders for now.

`.env` is gitignored. Confirm before you go further:

```bash
git check-ignore -v .env    # should print a .gitignore line
```

### 2.2 See what is already applied

`drizzle-kit migrate` is **idempotent**: it reads the `__drizzle_migrations` table and applies only what is missing. Running it against a database that already has `0000`–`0005` is safe.

Check first, so you know what is about to change:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

| Missing table | Pending migration | Added by |
|---|---|---|
| `user_identities` | `0006` | Google OIDC + password auth |
| `rate_limit_counters` | `0007` | rate limiting |
| `password_reset_tokens` | `0008` | password reset |

If all three are absent and the older tables are present, only `0006`–`0008` will run.

### 2.3 Apply the migrations

```bash
npm run db:migrate
```

**Read the output for `0006`.** That is the migration whose snapshot drift was fixed in #120. If an earlier attempt already created `user_identities`, its `CHECK` constraint could collide — the statement is guarded with `duplicate_object` so it should pass, but this is the one to watch.

**If it fails**, the usual cause is the pooler. Retry with the *direct* connection string:

```bash
DATABASE_URL='<direct string>' npm run db:migrate
```

Then put the pooled one back in `.env` for the app. Migrating over a direct connection and running over the pooler is normal.

### 2.4 Check what landed

```bash
npm run db:studio
```

You should see **13 tables**: `users`, `reports`, `rewards`, `collected_wastes`, `notifications`, `transactions`, `audit_log`, `roles`, `user_roles`, `reward_catalog`, `user_reward_balance`, `point_transactions`, `user_identities`, `rate_limit_counters`, `password_reset_tokens`.

Confirm the roles seeded — migration `0004` inserts them:

```sql
SELECT name FROM roles ORDER BY name;
-- admin, citizen, dump_op, operator, supervisor
```

If that returns five rows, the database half is done.

---

## Phase 3 — Google OAuth

1. <https://console.cloud.google.com> → create a project (`kiteezi`).
2. **APIs & Services → OAuth consent screen**:
   - User type **External**
   - App name `Kiteezi Waste Management`, your support email, your developer email
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough — this app reads nothing else
   - Publishing status: leave it **Testing** and add your own address under **Test users**. Only listed users can sign in until you publish, which is what you want while testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**
   - **Authorised JavaScript origins** — add all three:
     ```
     http://localhost:3000
     https://<your-project>.vercel.app
     https://<your-project>-git-dev-<team>.vercel.app
     ```

**⚠️ This is the step that broke Web3Auth.** The error was `could not validate redirect, please whitelist your domain`, naming a URL like `kiteezi-…-np9n5wuu0-….vercel.app`. That hash is **per-deployment** — whitelist it and sign-in works on that build and breaks on your next push.

Use the **stable** URLs, which Vercel lists under **Project → Domains**: the production domain and the `git-<branch>` alias. Never the hashed preview.

4. Copy the client ID (`…apps.googleusercontent.com`) into `.env` — **both variables, same value**:

```bash
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID='<client id>'
GOOGLE_OAUTH_CLIENT_ID='<client id>'
```

They are split deliberately. The `NEXT_PUBLIC_` one is bundled into the browser so Google's script can initialise; the other is server-only and is the expected `aud` when verifying a token. Token verification must not depend on a browser-exposed variable. **If the server-only one is missing or blank, verification fails closed and nobody can sign in** — that is by design, not a bug.

> No `redirect URI` is needed. This app uses Google Identity Services, which returns a token to the page rather than redirecting.

---

## Phase 4 — First sign-in, and making yourself an admin

```bash
npm run dev
```

Open <http://localhost:3000>, click **Sign in with Google**.

**What should happen:** Google's dialog appears → you pick your account → the header shows your name and a points balance of 0.00.

Confirm the round trip actually reached the database:

```sql
SELECT u.id, u.email, ui.provider FROM users u
JOIN user_identities ui ON ui.user_id = u.id;
```

One row, provider `google`. That single row is the first time this application has ever authenticated a real person against real Postgres.

### Make yourself an admin

**Nothing grants admin automatically.** Migration `0004` gives every user `citizen`, so `/report` and `/my-reports` work but every supervisor and admin action refuses you. Promote yourself in Drizzle Studio or any SQL client:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u CROSS JOIN roles r
WHERE u.email = '<your email>' AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

Roles are read fresh on every request, so it takes effect immediately — no sign-out needed.

### Try the loop

Submit a report at `/report`, then check `/my-reports`. Then confirm the reward ledger actually moved:

```sql
SELECT kind, amount FROM point_transactions;   -- earn_report, 10
SELECT points FROM user_reward_balance;        -- 10
```

If those two agree, the transaction handling, the ledger invariant and the vertical slice are all proven against a real database for the first time.

---

## Phase 5 — Resend and email DNS

Password reset works locally without this: `EMAIL_TRANSPORT='console'` prints the link to your terminal, and pasting it into the browser completes the flow. **Do that first** — it verifies the reset logic before you involve DNS.

### Option A — no domain (`resend.dev`)

Resend provides a shared test sender needing no domain and no DNS. Its limit
is real and worth understanding before relying on it:

> the `resend.dev` domain can only send to **the email address associated with
> your Resend account**. Anyone else gets a 403.

**Exactly that address — `+aliases` do not work.** Sending to
`you+test@gmail.com` when the account is `you@gmail.com` returns **403**,
verified 2026-08-30. Gmail would deliver it, Resend refuses to hand it over.
That matters more than it sounds, because it removes the obvious way to hold
a Google account and a password account at the same address: the anti-takeover
guard in `establish-session` refuses to attach a password to an address
another account already owns, and a `+alias` cannot be used to sidestep it
while still receiving mail.

The practical consequence is that the two halves must be verified separately,
which is fine — they are independent:

| Half | How to verify without a domain |
|---|---|
| **Delivery** | Send one real message to the account address through `ResendEmailSender` |
| **Reset logic** | Drive the use-cases against the database with an in-memory email sender, and read the link from the captured message |

Both were done on 2026-08-30. Delivery was accepted by the live API, and the
full flow — register, request, reset, replay, sign in — passed against real
Neon, including the two properties that had only ever been tested against a
fake: **only the token's SHA-256 is stored** (a raw-token lookup finds
nothing) and **a replayed link is refused**.

That is enough to prove the integration works — the API key, the request the
adapter builds, and a real email arriving with a working link — which is the
one thing unit tests cannot show. It is **not** enough for other people to
receive mail.

1. <https://resend.com> → sign up **with the address you want to receive test
   mail at**. That is the only address that will work.
2. **API Keys → Create**, with sending access.
3. Configure:

```bash
RESEND_API_KEY='re_...'
EMAIL_FROM='Kiteezi <onboarding@resend.dev>'
EMAIL_TRANSPORT=''          # empty or removed — 'console' sends nothing
```

⚠️ **If you set this in production**, password reset will appear to work for
everyone while only your address receives anything. Everyone else gets a
silent 403 — logged server-side, reported to the user as success, because the
form must not become an account enumerator. Fine while you are the only user;
move to Option B before that stops being true.

### Option B — your own domain (needed for real users)

1. <https://resend.com> → **Domains → Add Domain**. You need a domain you
   control; Resend will not send from an address you cannot prove.
2. Resend shows DNS records to publish — typically:
   - a **TXT** record for SPF
   - one or more **CNAME** or **TXT** records for DKIM
   - optionally a **TXT** for DMARC
4. Add them at your DNS provider. Propagation is usually minutes but can take up to 48 hours.
5. Wait for Resend to show the domain **Verified**.
6. **API Keys → Create**, with send permission.
7. Update `.env`:

```bash
EMAIL_TRANSPORT=''                # or remove the line — anything but 'console' sends for real
RESEND_API_KEY='re_...'
EMAIL_FROM='Kiteezi <no-reply@your-domain>'
```

**⚠️ SPF and DKIM are not optional.** Without them, mail is rejected or — worse — silently filtered into spam. Silent filtering is the failure you will not notice, because **every send still reports success**. That is why the domain must show Verified before you trust this.

Test end to end: `/forgot-password` → your address → the email should arrive, and its link should let you set a new password.

---

## Phase 6 — Vercel production

Vercel is already connected and building previews. What is missing is configuration.

1. **Project → Settings → Environment Variables.** Add, for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `SESSION_SECRET` | **generate a NEW one** — see below |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | the client ID |
| `GOOGLE_OAUTH_CLIENT_ID` | the same client ID |
| `NEXT_PUBLIC_APP_URL` | `https://<your production domain>` |
| `RESEND_API_KEY` | from Phase 5 |
| `EMAIL_FROM` | from Phase 5 |

**Do not reuse your local `SESSION_SECRET`.** A secret that exists on a laptop and in production means a laptop compromise forges production sessions. Generate a second one.

**Do not set `EMAIL_TRANSPORT` in production.** Leaving it unset is what selects the real sender. Setting it to `console` would silently swallow every email while reporting success.

2. Redeploy so the new variables are picked up — existing builds do not see them.
3. Apply the migrations against the same database if you have not already (Phase 2.2 did this; one database means one migration run).
4. Sign in on the production URL.

> If Google rejects the production origin, it is not on the whitelist from Phase 3. Add the exact domain Vercel shows under **Domains**.

---

## Phase 7 — Verify the token claims (closes #110)

One outstanding verification from #105: `aud` is *assumed* to be the client ID. It is standard OIDC and the value the SDK is built with, but it has never been confirmed against a live token. If wrong, sign-in fails **loudly** — an outage, not a security hole.

Now that you can sign in, confirm it. In the browser console on a page where you are signed in, capture the credential, then decode it **locally**:

```bash
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" "<idToken>"
```

**Never paste a live token into an online JWT decoder** — it is a working credential.

Check:
- `aud` equals your client ID → #105 is confirmed, close #110
- `iss` is `https://accounts.google.com` or `accounts.google.com` → already enforced, no action

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No database connection string was provided` | `DATABASE_URL` missing | Phase 2.1 |
| `SESSION_SECRET is not set` | missing secret | Phase 2.1 |
| `GOOGLE_OAUTH_CLIENT_ID is not set; refusing to verify` | server-only variable missing | Phase 3.4 — this is fail-closed by design |
| Google: `origin is not allowed` | domain not whitelisted, or you used a hashed preview URL | Phase 3.3 |
| Sign-in works, then 500 | database unreachable or migrations not applied | Phase 2.2 |
| Every action returns `FORBIDDEN` | you are still a `citizen` | Phase 4 |
| `Too many attempts` while testing | rate limits (5 sign-ins per email per 5 min) | wait, or `DELETE FROM rate_limit_counters;` |
| Reset email never arrives | SPF/DKIM unverified, or `EMAIL_TRANSPORT=console` | Phase 5 |
| `NEXT_PUBLIC_APP_URL is not set` | missing; reset links cannot be built | Phase 2.1 / 6.1 |

---

## Done when

- [ ] Migrations `0000`–`0008` applied; `roles` has five rows
- [ ] You can sign in with Google locally
- [ ] You hold the `admin` role
- [ ] A report submitted at `/report` appears in `/my-reports`
- [ ] `point_transactions` and `user_reward_balance` agree
- [ ] Password reset completes (console transport is enough to prove the logic)
- [ ] Production environment variables set, with a **separate** `SESSION_SECRET`
- [ ] Sign-in works on the production URL
- [ ] `aud` confirmed against a real token (#110)

## What this does *not* fix

- **No backups or PITR configured** — Neon's defaults only. Before real data, review retention (KWM-070).
- **A reset does not invalidate existing sessions** (KWM-079 / #109).
- **No email verification at registration** — a password account's address is unconfirmed.
- **Expired rate-limit counters and reset tokens are never purged** — slow, unbounded growth until KWM-058.
- **No error tracking** — a production failure is only visible in Vercel's logs (KWM-071).

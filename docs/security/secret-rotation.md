# Secret Rotation Runbook

**Owner:** repository maintainer (currently single-developer)
**Audience:** anyone with admin access to Neon, Vercel, Web3Auth, and Ankr
**Cadence:** rotate on a schedule and on demand (suspected leak, contributor offboarding, anomaly in logs)

This runbook documents how to rotate every credential the application uses, in what order, and how to verify the rotation succeeded. It is the operational counterpart to issue **KWM-001**.

---

## 1. Inventory of secrets

| # | Variable | Provider | Where it lives | Server-only? | Rotation cadence |
|---|----------|----------|----------------|--------------|------------------|
| 1 | `DATABASE_URL` | Neon | Vercel envs + local `.env` | ✅ yes | Every 90 days, or on suspicion |
| 2 | `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` | Web3Auth | Vercel envs + local `.env` + browser bundle | ❌ (client-bundled) | On project re-init only; security relies on domain allowlist |
| 3 | `NEXT_PUBLIC_WEB3AUTH_NETWORK` | n/a (string flag) | Vercel envs + local `.env` | ❌ | Change only when migrating dev/prod |
| 4 | `NEXT_PUBLIC_RPC_URL` | Ankr | Vercel envs + local `.env` + browser bundle | ❌ (client-bundled) | Every 180 days, or on rate-limit anomaly |

The `NEXT_PUBLIC_*` variables ship in the client JavaScript bundle and are therefore **not secrets** in the traditional sense — anyone with the URL can read them. They are listed here because they have monetary or rate-limit exposure if abused.

---

## 2. Pre-rotation checklist

Before rotating anything:

- [ ] Tag the current production deploy in Vercel so you can roll back.
- [ ] Confirm you have admin access to Neon, Vercel, Web3Auth, Ankr.
- [ ] Identify a low-traffic window (rotation may cause brief 5xx errors on cold connections).
- [ ] Open the local `.env` and back it up to a password manager (1Password / Bitwarden) so the new values land somewhere durable.
- [ ] Confirm no scheduled jobs / migrations are running against the database.

---

## 3. Rotate `DATABASE_URL` (Neon)

### 3.1 Generate a new role + password

1. Sign in to **https://console.neon.tech**.
2. Select project → **Roles** tab.
3. Either:
   - **Recommended:** create a new role `kiteezi_app_YYYYMMDD` with a fresh password; assign it `CONNECT` + read/write on the schemas in use (or reuse the existing role and click **Reset password**).
   - **Alternative:** select the existing `neondb_owner` and click **Reset password** (simpler; loses audit-by-name).
4. Copy the new connection string (Neon shows it once; persist immediately to your password manager).

### 3.2 Update environments (in this order, top-down)

1. **Local** — edit your `.env`, paste the new `DATABASE_URL`. Restart `next dev`.
2. **Vercel preview** — `vercel env rm DATABASE_URL preview` then `vercel env add DATABASE_URL preview` (paste new value). Or in the dashboard: Project → Settings → Environment Variables.
3. **Vercel production** — same as preview but for the `production` scope. **Deploy to apply** (`vercel deploy --prod`).
4. **Vercel development** — same, for the `development` scope.

### 3.3 Verify

- Local: `npm run dev` → smoke-test the home page; verify no `Error: invalid password` in console.
- Production: open the deployed URL; verify auth/notifications still load.
- Run `psql "$DATABASE_URL" -c '\dt'` against the new URL — should list tables.

### 3.4 Decommission the old password

1. In Neon, **delete the old role** OR **rotate the old role's password again to something random** (locks it out without leaving an unused role hanging around).
2. Verify the old connection string no longer works: `psql "<OLD_URL>" -c '\dt'` should fail with `password authentication failed`.

---

## 4. Rotate `NEXT_PUBLIC_RPC_URL` (Ankr API key)

### 4.1 Generate a new Ankr key

1. Sign in to **https://www.ankr.com/rpc/**.
2. Project → **API Keys** → **Create** (label e.g. `kiteezi-prod-YYYYMMDD`).
3. Copy the full Sepolia endpoint URL (`https://rpc.ankr.com/eth_sepolia/<NEW_KEY>`).

### 4.2 Update environments

1. Local `.env`.
2. Vercel envs (`preview`, `production`, `development`).
3. Redeploy.

### 4.3 Verify + retire

- Hit `https://rpc.ankr.com/eth_sepolia/<NEW_KEY>` with a `{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}` POST — expect a 200 with current block.
- In Ankr dashboard, **disable** the old key once production traffic has switched (give it ~30 minutes for CDN / preview deploys to roll over).

---

## 5. Rotate `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` (Web3Auth)

> Only do this if the Web3Auth project is being decommissioned or if the project's domain allowlist has been compromised. The client ID is public by design.

### 5.1 Tighten without rotating (preferred)

1. **https://dashboard.web3auth.io** → Project → **Allowed Origins**.
2. Ensure ONLY the production domain, `*.vercel.app` preview prefix, and `http://localhost:3000` are listed.
3. Remove any wildcards (`*`), localhost variants you don't use, or stale staging domains.

### 5.2 Full rotation (only if compromised)

1. Create a **new** Web3Auth project for `Sapphire Devnet` (or `Sapphire Mainnet` for prod).
2. Set Allowed Origins to your domains only.
3. Copy the new Client ID.
4. Update Vercel envs and local `.env`.
5. Deploy.
6. **Migrate user wallets first.** Web3Auth-issued wallets are tied to the (verifier × clientId) pair — changing the clientId may produce new wallet addresses for existing users. Plan a user-facing migration before doing this; do not do it casually.
7. Once verified, archive the old project in the Web3Auth dashboard.

---

## 6. Post-rotation

- [ ] Confirm all four environments (local, preview, dev, prod) use the new values.
- [ ] Update **1Password / Bitwarden / Doppler** with the new values; mark the old ones archived.
- [ ] Add a calendar reminder for next rotation per §1 cadence.
- [ ] Note the rotation in `docs/security/CHANGELOG-secrets.md` (date, who, why) — create the file on first rotation.
- [ ] If rotation was triggered by a suspected leak, also write up an incident note in `docs/security/incidents/YYYY-MM-DD-<short-slug>.md` covering: what leaked, how, blast radius, what we changed, what we'd do differently.

---

## 7. What NOT to do

- **Do NOT** commit `.env`. The `.gitignore` blocks `.env` and `.env.*` while keeping `.env.example`; respect those rules.
- **Do NOT** paste secrets into GitHub issues, PR descriptions, Discord, screenshots, or AI-assistant context windows.
- **Do NOT** put server-only secrets behind a `NEXT_PUBLIC_` prefix. That prefix forces them into the client bundle.
- **Do NOT** re-export server secrets via `next.config.mjs`'s `env:` field — that also leaks them to the client bundle. (See issue KWM-002.)
- **Do NOT** rotate the Web3Auth client ID casually — it can orphan user wallets.

---

## 8. Rotation log

(Maintain manually below; one row per rotation event.)

| Date (UTC) | Variable | Triggered by | Operator | Notes |
|-----------|----------|--------------|----------|-------|
| _none yet_ | | | | |

# TECHNICAL AUDIT
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18
**Branch:** `dev`

Severity legend: 🔴 **critical** · 🟠 **high** · 🟡 **medium** · 🟢 **low / cosmetic**

---

## 1. Frontend

### 1.1 Architecture
- **App Router** is used, but `app/layout.tsx` is annotated `"use client"` (`layout.tsx:1`). 🔴
  - **Effect:** every page in the tree is forced into a client component subtree. Server Components, streaming, `generateMetadata()`, and per-route caching are all defeated.
  - **Why it's there:** the developer needed `useState` for `sidebarOpen` and put it in the root layout.
  - **Fix:** move the sidebar open/close state into a small `"use client"` shell component nested inside a server `RootLayout`. Keep the layout server-side so `metadata` works.
- **`app/metadata.tsx`** exports a `Metadata` object but is **never imported** anywhere. Because the layout is client, the only way to set page metadata is via `generateMetadata` from a server component. The current title/description never reach the browser. 🟠

### 1.2 Routing & pages
- Only `/` exists. Every other Sidebar item 404s. 🔴
- No `loading.tsx`, no `error.tsx`, no `not-found.tsx` in the app tree. 🟠

### 1.3 Component quality
- `components/Header.tsx` is 340 lines and mixes:
  - Web3Auth SDK setup at **module scope** (`Header.tsx:60–80`). 🟠 — runs once per HMR cycle, leaks listeners; should be inside an effect or a provider.
  - Auth state, balance state, notification state, mobile detection — all in one component. Should be split (e.g. `useWeb3Auth`, `useNotifications`, `useBalance`).
  - Inline interfaces (`UserInfo`, `NotificationItem`, `HeaderProps`) — should live in a shared `types/` directory.
  - Mixed casing (`userInfor`, `getUserInfor`) — typos that have propagated. 🟢
- `components/Sidebar.tsx` 🟡:
  - Hard-codes 5 nav items; no role-based filtering hook.
  - No keyboard navigation, no `aria-current`, no focus trapping when mobile drawer is open.
  - No backdrop / scrim on mobile — clicking outside doesn't close the drawer.
- `useMediaQuery` (`hooks/useMediaQuery.tsx:14–17`) uses **deprecated** `addListener` / `removeListener`. Modern browsers warn; some emit deprecation events. Replace with `addEventListener('change', …)`. 🟡
- `app/page.tsx` is a 99-line file whose entire body is a commented-out `<main>` block. 🟠 — production builds ship the empty grid.

### 1.4 Styling / design system
- shadcn/ui style: `new-york`. Only `button`, `badge`, `dropdown-menu` generated. 🟡
- Brand identity: ad-hoc green (`text-green-500`, `bg-green-600`); no design tokens for "Kiteezi" brand. 🟡
- Tailwind config defines `darkMode: ["class"]` but there is **no theme toggle** anywhere. 🟢

### 1.5 Accessibility
- Search input has no `<label>` or `aria-label`. 🟡
- Buttons that only contain an icon (notification bell, menu, search) need `aria-label`. 🟡
- No skip-to-content link. 🟡
- Sidebar `<aside>` lacks `aria-label="Primary navigation"`. 🟢
- No focus management for the mobile drawer. 🟡

### 1.6 Responsiveness
- Custom `useMediaQuery('(max-width: 768px)')` plus Tailwind `lg:` prefixes — two responsive systems coexist. Risk of drift. 🟢
- Sidebar fixed at `w-64` and `lg:translate-x-0` — works, but lacks a mobile close-on-route-change behaviour.

### 1.7 State management
- No global store. Wallet state, user identity, balance, and notifications are each re-fetched in each consumer. 🟠
- No caching / dedupe (TanStack Query or SWR would be ideal). 🟠
- Custom `'balanceUpdate'` `window` event for cross-component balance refresh (`Header.tsx:159–168`) — fragile, untyped, hard to trace. 🟡

### 1.8 Forms / validation
- None exist yet. Recommendation: react-hook-form + Zod. 🟡

### 1.9 Dead code / debt
- `app/page.tsx` body — commented-out boilerplate. 🟠
- Unused `setSidebarOpen` setter pattern (the layout is client just to host one boolean — the component model itself is the smell). 🟡
- `react-hot-toast`'s `<Toaster />` is mounted but no `toast(...)` calls anywhere. 🟢
- Geist fonts are loaded in `app/fonts/` but `Inter` is imported in `layout.tsx` — Geist files are dead weight in the bundle. 🟡
- Header imports `Link` from `next/link` but for the user dropdown wraps the trigger inside a `Link` inside a `Button` (`Header.tsx:329`) — nested interactive elements; produces invalid HTML. 🟡

---

## 2. Backend (Server Actions / Data Layer)

### 2.1 Server-action boundary
- `utils/db/actions.ts` exports 25 async functions. 🔴 **No `"use server"` directive** at the top of the file.
  - Functions are imported directly from `"use client"` components.
  - Next.js may still tree-shake the Drizzle/Neon code out of the client bundle (because `neon()` and `drizzle()` reach for `process.env.DATABASE_URL`, which is only available server-side), but this is undefined behaviour, not a guarantee.
  - **Fix:** declare `"use server"` and have every function pass through a validated server action gate.

### 2.2 Authorization
- Every server action accepts `userId: number` and trusts it. 🔴
  - Example: `redeemReward(userId, rewardId)` (`actions.ts:436`) — a caller may pass any user's ID.
  - **Fix:** derive `userId` from a verified session on the server; never read it from the client.

### 2.3 Input validation
- No Zod / Joi / Yup. 🔴
- `createReport` accepts arbitrary `location: string`, `wasteType: string`, `amount: string`, optional `imageUrl: string` — no length cap, no shape, no enum.
- `wasteType` should be an enum.
- `amount` should be `numeric` with a unit column, not `varchar(255)`.
- `imageUrl` should be validated (URL shape, allowed host).

### 2.4 Error handling
- Every action does `try / catch (error) { console.error … ; return null }`. 🟠
  - **Effect:** callers cannot distinguish "row not found" from "DB timeout" from "validation error". The UI cannot show useful messages.
  - **Fix:** introduce a typed result type (e.g. `Result<T, ActionError>`) and surface error codes.

### 2.5 Transactions
- 🔴 `createReport` (`actions.ts:31–74`) performs 4 writes (Reports insert + points update + transaction insert + notification insert) **outside a transaction**. Partial failures will desync the ledger.
- 🔴 `redeemReward(0)` (`actions.ts:436–456`) zeros `Rewards.points` then inserts a transaction — non-atomic.
- `getOrCreateReward` is read-then-write — without a unique constraint on `Rewards.user_id`, two concurrent invocations will both insert. 🟠

### 2.6 Logical bugs
| # | Location | Severity | Bug |
|---|----------|----------|-----|
| B-1 | `actions.ts:251 saveReward` | 🔴 | Inserts a new `Rewards` row each time instead of updating the user's existing reward. Generates per-user duplicates; balance computation across `Rewards` becomes meaningless. |
| B-2 | `actions.ts:348 getRewardTransactions` | 🔴 | `LIMIT 10` returned to UI **and** consumed by `getUserBalance` / `getAvailableRewards` — anyone with >10 lifetime txns sees the wrong balance. |
| B-3 | `actions.ts:485 getUserBalance` | 🔴 | Depends on B-2; also re-derives balance from transactions while another path writes directly to `Rewards.points` (`updateRewardPoints`) — two sources of truth. |
| B-4 | `actions.ts:123` vs `:275` | 🟠 | `createCollectedWaste` and `saveCollectedWaste` both insert into the same table with different default `status`. Pick one. |
| B-5 | `actions.ts:436 redeemReward(0)` | 🟠 | Zeroes `Rewards.points`, inserts `redeemed` txn for the **pre-update** value of `userReward.points` — if another action increments `Rewards.points` between read and write, value is wrong. |
| B-6 | `actions.ts:5 createUser` | 🟠 | Returns `null` on duplicate-email; caller has no way to tell apart "already exists" from "DB error". UI calls it on every load → silent no-op. |
| B-7 | `Header.tsx:76 web3Auth` | 🟠 | Singleton constructed at module scope. Re-runs on every HMR; `initModal` is called from an effect that does not guard against double-init. |
| B-8 | `Header.tsx:108 localStorage.email` | 🔴 | Used as identity for downstream calls. Any tab / extension can overwrite it. |
| B-9 | `Header.tsx:140 setInterval` | 🟡 | Polls notifications every 30 s; effect dependency is `[userInfor]` so on every login it re-creates a new interval — fine, but no backoff, no server push. |
| B-10 | `next.config.mjs:3-6` | 🔴 | Re-exports `DATABASE_URL` via `env: { DATABASE_URL: process.env.DATABASE_URL }` — **this makes it a public env value** (inlined into client bundle). Combined with the lack of a `"use server"` boundary, the DB URL may end up in the browser. |
| B-11 | `drizzle.config.js` | 🟠 | Does not `import 'dotenv/config'` — `process.env.DATABASE_URL` is `undefined` at CLI time unless the shell has it pre-exported. `db:push` silently no-ops. |
| B-12 | `Header.tsx:78` | 🟡 | Hard-codes `WEB3AUTH_NETWORK.SAPPHIRE_DEVNET` despite `NEXT_PUBLIC_WEB3AUTH_NETWORK` being declared in `.env.example`. The env var is unused. |
| B-13 | `Header.tsx:64` | 🟡 | Reads `process.env.NEXT_PUBLIC_RPC_URL` — but it's not declared in `.env.example`. |
| B-14 | `Header.tsx:329` | 🟡 | Renders `<Link>` inside `<DropdownMenuItem>` (which renders a button by default) — nested interactive elements. |

### 2.7 Logging / monitoring
- All logs are `console.error`. 🟠 No structured logging. No correlation IDs. No log shipper.
- No telemetry library: no Sentry, no OpenTelemetry, no PostHog. 🟠
- No metrics: request counts, error rates, latency — none captured.

### 2.8 Performance
- Heaviest query: `getAllRewards` (Rewards × Users) — unindexed; OK at toy scale, sequential scan at 10k+ rows. 🟡
- Notification polling every 30 s ✕ N concurrent users = N/30 QPS on Neon. 🟡 (consider SSE or refetch-on-focus.)

---

## 3. Database

### 3.1 Schema quality
See PROJECT_DISCOVERY_REPORT.md §4.3 for full enumeration. Highlights:
- 🔴 No indexes on hot FK columns (`Reports.user_id`, `Reports.status`, `Notifications.userId`, `Transactions.userId`, `CollectedWastes.collectorId`).
- 🔴 `Rewards.user_id` lacks a unique constraint despite the code treating it as a one-row-per-user balance.
- 🟠 No Postgres enums for status / type / waste category. Free-text invites typos that break filters.
- 🟠 `amount varchar(255)` for a numeric quantity.
- 🟠 No `deleted_at` columns; no soft-delete strategy.
- 🟠 FK references omit `onDelete` — orphan risk.
- 🟢 Typo: `collectionInfor` should be `collectionInfo`.

### 3.2 Migrations
- 🔴 No migration files on disk (`drizzle/` directory missing).
- 🔴 The dev workflow is `db:push` — which generates no diff history.
- **Fix:** switch to `drizzle-kit generate` + commit migration SQL. Add a `db:migrate` script and run it in CI / deploy.

### 3.3 Constraints
- No check constraints (e.g. `points >= 0`, `amount > 0`). 🟠
- No partial indexes for "unread notifications" or "pending reports". 🟢

### 3.4 Data integrity / audit
- 🟠 No `audit_log` table.
- 🟠 No `created_by` / `updated_by` columns.
- 🟠 No event sourcing for reward changes; balance is reconstructed from `Transactions` but the ledger isn't immutable (no append-only protection).

---

## 4. Authentication & Authorization

### 4.1 Authentication
- 🔴 Web3Auth provides a wallet + (optionally) social login on the **client**. The server never sees, verifies, or stores anything.
- 🔴 No session token (JWT, cookie). No verification of the Web3Auth ID-token on the server.
- 🔴 Identity surrogate downstream is **`localStorage.email`** — trivially spoofable.

### 4.2 Authorization
- 🔴 No RBAC. No "is this caller allowed to update report X?" checks. Any caller can pass any `userId` to any server action.

### 4.3 Session management
- 🔴 Nonexistent. Logout clears `localStorage.email` and disconnects Web3Auth — but a server hitting a DB action does not know whether the user is logged in.

### 4.4 OWASP Top 10 (quick map)
| OWASP | Status | Notes |
|-------|--------|-------|
| A01 Broken Access Control | 🔴 | No server-side authz; trusts client-supplied `userId`. |
| A02 Cryptographic Failures | 🟠 | No data classification; nothing encrypted at rest beyond Neon's defaults. |
| A03 Injection | 🟢 | Drizzle parametrises queries; OK so far. |
| A04 Insecure Design | 🔴 | Identity = `localStorage` value; balance has two sources of truth. |
| A05 Security Misconfiguration | 🔴 | `.env` committed; `DATABASE_URL` re-exposed via `next.config.mjs`. |
| A06 Vulnerable Components | 🟡 | Bleeding-edge React 19 with `@types/react@18`; Web3Auth modal pinned to 9.4.5. Run `npm audit`. |
| A07 Identification & Auth Failures | 🔴 | See §4.1–4.3. |
| A08 Software & Data Integrity Failures | 🟠 | No CSP, no SRI, no signed releases, no CI integrity checks. |
| A09 Logging & Monitoring Failures | 🟠 | Only `console.error`; no aggregation. |
| A10 SSRF | 🟢 | No outbound URL fetching from user input — yet. |

---

## 5. DevOps

### 5.1 CI/CD
- 🔴 **None.** No `.github/workflows`, no GitLab CI, no CircleCI.
- No build / test / lint gate. PRs #2–#5 were merged with no automated checks.

### 5.2 Deployment
- 🔴 No `Dockerfile`, no `docker-compose.yml`, no `vercel.json`, no IaC.
- Implied target: Vercel deploy via Git integration (not configured here).

### 5.3 Environments
- 🔴 One `.env`, committed. No `.env.staging`, no `.env.production`, no secret manager.
- Web3Auth network hard-coded to `SAPPHIRE_DEVNET`.
- RPC URL falls back to a public `rpc.ankr.com/eth_sepolia` shared endpoint.

### 5.4 Secrets
- 🔴 `.env` is tracked. The actual `DATABASE_URL` and `WEB3_AUTH_CLIENT_ID` are likely already exposed in the public repository history.
- **Required action:** rotate both credentials, force-rewrite git history (BFG / `git filter-repo`) or accept exposure, add `.env` to `.gitignore`.

### 5.5 Monitoring / alerting / backups / DR
- 🔴 None.
  - No uptime monitor (Better Uptime, Pingdom).
  - No error tracker (Sentry).
  - No Neon backup retention plan documented.
  - No runbook, no on-call rotation.

---

## 6. Testing

### 6.1 Coverage
- 🔴 **0 %.** No test framework, no test files.

### 6.2 What is needed
- Unit: server actions (DB mocked with `drizzle-mock` or fresh schema in a test DB).
- Integration: server actions end-to-end against a real Postgres (testcontainers or Neon branch).
- E2E: Playwright on the citizen + operator + admin happy paths.
- Visual regression: Chromatic or Playwright screenshots on the key dashboards.
- Accessibility: axe-core in Playwright CI.

---

## 7. Build, TypeScript, Lint

### 7.1 TypeScript
- `strict: true` ✅
- `"target": "ES2017"` — fine for Vercel / Node 20 runtime.
- `@types/react@18` paired with `react@19.2.0` 🟠 — types are wrong for React 19 features (use, Form Actions). Bump to `@types/react@19`.

### 7.2 ESLint
- Only the default `next/core-web-vitals` + `next/typescript`. 🟡 No import order rules, no React Hooks exhaustive-deps autofix, no `tailwindcss/classnames-order`.

### 7.3 Formatter
- No Prettier config 🟢 — recommended for team work.

### 7.4 Pre-commit / Commit hygiene
- No Husky / lint-staged.
- Commit messages are sentence-style, sometimes 2-paragraph (`deb62e2`, `c12efcb`). 🟢 — consider Conventional Commits.

---

## 8. Bundle / Performance

- `Web3Auth Modal` SDK adds substantial weight to the bundle (web3 dependency tree). Acceptable for the use-case but consider dynamic import / `next/dynamic` for the login modal.
- No image pipeline — `Reports.imageUrl` is intended to point at uploaded images but no upload route, no `next/image` config, no remote pattern allowlist.

---

## 9. Summary of Critical Defects (to fix before production)

| # | Severity | Defect | Where |
|---|----------|--------|-------|
| C-1 | 🔴 | `.env` committed to repo | `.env`, `.gitignore` |
| C-2 | 🔴 | `DATABASE_URL` re-exported to client | `next.config.mjs:3-6` |
| C-3 | 🔴 | No server-side auth / session | n/a (missing) |
| C-4 | 🔴 | Server actions trust client-supplied `userId` | `utils/db/actions.ts` |
| C-5 | 🔴 | No `"use server"` boundary | `utils/db/actions.ts:1` |
| C-6 | 🔴 | `Rewards` modelled as both balance and event log | `schema.ts:24–34`, `actions.ts:251` |
| C-7 | 🔴 | `getUserBalance` truncated to 10 most recent transactions | `actions.ts:348, 485` |
| C-8 | 🔴 | No DB migrations | `drizzle/` missing |
| C-9 | 🔴 | No CI/CD | `.github/` missing |
| C-10 | 🔴 | No tests | repo-wide |
| C-11 | 🔴 | Sidebar links lead to 404s | `Sidebar.tsx:6–12` |
| C-12 | 🔴 | `app/layout.tsx` is `"use client"` (kills SSR + metadata) | `app/layout.tsx:1` |

Resolving C-1 through C-12 is a hard prerequisite for any production deployment.

# GITHUB ISSUES
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18

> Every issue below is atomic, independently testable, and independently deployable. They are derived strictly from evidence in the repo at audit time; nothing has been invented. Issues are grouped by epic (matching `MASTER_DELIVERY_ROADMAP.md`).

Issue ID convention: `KWM-###`. Use these IDs in commit messages, branch names (`feat/KWM-007-…`) and PR titles.

Labels are suggested in `[brackets]` after the title.

---

## Epic 1 — Core Platform Foundation

---

### KWM-001 · [SECURITY] Rotate leaked secrets and remove `.env` from git history
**Labels:** `security` · `priority-critical` · `devops`

**Description**
The `.env` file is tracked in the repository (only `.env*.local` is in `.gitignore`). It contains `DATABASE_URL` and `NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID`. Both have been committed and pushed to a public-or-shared remote, so they must be treated as compromised.

**Current state**
- `.env` exists at the repo root and is checked in.
- `.gitignore` only excludes `.env*.local`.

**Desired state**
- All previously committed secrets rotated at their providers (Neon, Web3Auth).
- `.env` removed from git history (`git filter-repo` or BFG).
- `.gitignore` extended to `.env`, `.env.*` (allowlisting `.env.example`).
- A documented secret-rotation procedure committed to `docs/security/secret-rotation.md`.

**Acceptance Criteria**
- [ ] Neon `DATABASE_URL` rotated.
- [ ] Web3Auth client ID regenerated (or, if not regenerable, domain allowlist tightened).
- [ ] `.env` no longer appears in `git log --all -- .env`.
- [ ] `.gitignore` updated.
- [ ] `docs/security/secret-rotation.md` added.
- [ ] Team notified; old DB URL deactivated.

**Technical Notes**
- `git filter-repo` is preferred over BFG for fidelity.
- Coordinate the rotation with KWM-005 (move secrets to a secret manager).

**Dependencies:** none (do first)
**Testing Requirements:** confirm no secret strings present anywhere in `git rev-list --all` × `git grep`.
**Definition of Done:** secrets rotated, history rewritten, force-push reviewed, all collaborators re-cloned.

---

### KWM-002 · [SECURITY] Remove `DATABASE_URL` re-export from `next.config.mjs`
**Labels:** `security` · `priority-critical` · `backend`

**Description**
`next.config.mjs` re-exports `DATABASE_URL` via the `env:` field, which **inlines it into the client bundle**. Combined with the absence of a `"use server"` boundary, this risks leaking the DB URL to the browser.

**Current state**
```js
// next.config.mjs:3-6
env: {
  DATABASE_URL: process.env.DATABASE_URL,
  WEB3_AUTH_CLIENTID: process.env.WEB3_AUTH_CLIENTID,
}
```

**Desired state**
- `next.config.mjs` does **not** export `DATABASE_URL`.
- Server code reads `process.env.DATABASE_URL` directly (Vercel runtime exposes it on the server).
- Client code reads only `NEXT_PUBLIC_*` variables.

**Acceptance Criteria**
- [ ] `env:` block removed (or reduced to genuinely-public values).
- [ ] Build inspected with `@next/bundle-analyzer`; no `DATABASE_URL` string in any client chunk.
- [ ] Production build smoke-tested.

**Dependencies:** KWM-001 (rotate first, fix second)
**Testing Requirements:** `grep -r "DATABASE_URL" .next/static` returns nothing.
**Definition of Done:** PR merged, prod build verified clean.

---

### KWM-003 · [SECURITY] Add `"use server"` boundary to `utils/db/actions.ts`
**Labels:** `security` · `priority-critical` · `backend` · `refactor`

**Description**
`utils/db/actions.ts` is imported from `"use client"` components but does not declare `"use server"`. Next.js's tree-shake into the client bundle is therefore relying on incidental behaviour.

**Desired state**
- The file begins with `"use server";`.
- All exported functions are valid server actions (return serialisable values).
- Drizzle / Neon imports never reach the client.

**Acceptance Criteria**
- [ ] `"use server"` directive added.
- [ ] Build clean; no Drizzle code in client chunks.
- [ ] All call sites still type-check.

**Dependencies:** KWM-002
**Testing Requirements:** `grep -r "drizzle-orm" .next/static` returns nothing.
**Definition of Done:** PR merged.

---

### KWM-004 · [FEATURE] Implement server-side Web3Auth ID-token verification + session cookie
**Labels:** `feature` · `security` · `priority-critical` · `backend` · `frontend`

**Description**
Authentication is currently client-only. Server actions accept arbitrary `userId` arguments because there is no server-side identity. This issue establishes a real session.

**Current state**
- Web3Auth Modal runs in `Header.tsx`; email is stored in `localStorage` and used downstream.
- No server-side session.

**Desired state**
- On Web3Auth login the client posts the Web3Auth ID-token to `/api/auth/session`.
- Server verifies the token against Web3Auth's JWKS endpoint.
- Server issues an HTTP-only `__Host-session` cookie (signed with a server secret; rolling refresh).
- A `getServerSession()` helper resolves the current user inside server actions.
- Logout calls `/api/auth/logout` which clears the cookie.

**Acceptance Criteria**
- [ ] `POST /api/auth/session` implemented and JWKS-validated.
- [ ] `POST /api/auth/logout` implemented.
- [ ] `getServerSession()` returns `{ userId, role } | null`.
- [ ] `Header.tsx` no longer writes to `localStorage`.
- [ ] Unit tests on session encoding / verification.

**Technical Notes**
- Use `jose` for JWT verification.
- Iron Session or hand-rolled `jose` SignJWT — either is acceptable.

**Dependencies:** KWM-001, KWM-002, KWM-003
**Testing Requirements:** tamper-test (modified JWT, expired JWT) returns 401.
**Definition of Done:** all server actions in subsequent issues derive `userId` from `getServerSession()`, not from arguments.

---

### KWM-005 · [INFRASTRUCTURE] Move all secrets to Vercel project envs / Doppler
**Labels:** `infrastructure` · `security` · `priority-critical` · `devops`

**Description**
Document and migrate environment variables out of `.env` into a managed secret store.

**Acceptance Criteria**
- [ ] Three Vercel environments: `development`, `preview`, `production`.
- [ ] All non-public envs added to each.
- [ ] `docs/runbook/secrets.md` describes who rotates what and how often.

**Dependencies:** KWM-001
**Testing Requirements:** preview deploy succeeds without `.env` present.
**Definition of Done:** PR + Vercel project state verified.

---

### KWM-006 · [REFACTOR] Convert `app/layout.tsx` back to a Server Component
**Labels:** `refactor` · `priority-high` · `frontend`

**Description**
`app/layout.tsx` is currently a `"use client"` file because it hosts `useState(sidebarOpen)`. This kills Server Components, streaming, and `metadata` for the entire tree.

**Desired state**
- `app/layout.tsx` is a server component.
- A small `<AppShell>` client component hosts the sidebar-open state and wraps `{children}`.
- `metadata` exports from `app/metadata.tsx` (or inline) are honoured.

**Acceptance Criteria**
- [ ] `app/layout.tsx` has no `"use client"`.
- [ ] `<title>` reflects `metadata.title` in browser dev tools.
- [ ] Sidebar toggle still works on mobile.

**Dependencies:** none
**Testing Requirements:** Playwright: title is "Kiteezi Waste Management System"; sidebar drawer opens & closes on mobile viewport.
**Definition of Done:** PR merged.

---

### KWM-007 · [REFACTOR] Extract Web3Auth setup from `Header.tsx` into a provider/hook
**Labels:** `refactor` · `priority-high` · `frontend`

**Description**
Web3Auth is instantiated at module scope inside `Header.tsx` (`Header.tsx:60–80`). It also re-runs on every HMR and leaks listeners. Centralise it.

**Acceptance Criteria**
- [ ] `<Web3AuthProvider>` mounts the SDK in a single `useEffect` with strict-mode safe init.
- [ ] `useWeb3Auth()` exposes `{ user, isReady, login, logout }`.
- [ ] `Header.tsx` consumes the hook only.

**Dependencies:** KWM-006
**Testing Requirements:** no duplicate "initialising" logs in dev StrictMode; double-mount safe.
**Definition of Done:** PR merged.

---

### KWM-008 · [DATABASE] Add `role` column + `roles` / `user_roles` tables; seed default roles
**Labels:** `feature` · `database` · `priority-critical` · `security`

**Description**
The Users table has no role. RBAC requires it.

**Desired state**
- `roles (id, name unique, description)` seeded with `citizen`, `operator`, `supervisor`, `admin`, `dump_op`.
- `user_roles (user_id, role_id, granted_at, granted_by)`.
- Migration written and committed.
- `getServerSession()` returns roles array.

**Acceptance Criteria**
- [ ] Migration applied to staging Neon branch.
- [ ] Seed script for the 5 roles.
- [ ] Default newly-created users get `citizen`.

**Dependencies:** KWM-004, KWM-013 (migrations infra)
**Testing Requirements:** integration test: new user has role `citizen`; admin can grant roles.
**Definition of Done:** PR merged + staging migrated.

---

### KWM-009 · [SECURITY] Add `requireRole()` server-action wrapper and apply to all mutating actions
**Labels:** `security` · `priority-critical` · `backend`

**Description**
Enforce RBAC at the action boundary.

**Acceptance Criteria**
- [ ] `requireRole(['admin'])` wrapper exists; throws `UnauthorizedError` otherwise.
- [ ] Every mutating action in `utils/db/actions.ts` either calls `requireRole` or derives `userId` from session for self-ops.
- [ ] Unit tests assert 403 path.

**Dependencies:** KWM-004, KWM-008
**Testing Requirements:** integration tests for every role × every action.
**Definition of Done:** PR merged.

---

### KWM-010 · [REFACTOR] Replace `localStorage.email` identity with session-derived identity
**Labels:** `security` · `refactor` · `priority-critical` · `frontend`

**Description**
Remove `localStorage` as an identity surrogate. All client code that needs the current user reads from the session via a `useSession()` hook that hits `/api/auth/me`.

**Acceptance Criteria**
- [ ] No `localStorage.getItem('email')` anywhere in the codebase.
- [ ] `useSession()` returns `{ user, isLoading }`.

**Dependencies:** KWM-004
**Testing Requirements:** Playwright: clear localStorage mid-session → app still recognises logged-in user.
**Definition of Done:** PR merged.

---

### KWM-011 · [DATABASE] Rebuild `Rewards` schema: separate balance from catalog from ledger
**Labels:** `database` · `bug` · `priority-critical` · `backend`

**Description**
The current `Rewards` table conflates per-user balance and per-event amount; `saveReward` duplicates rows.

**Desired state**
- `reward_catalog (id, name, description, cost_points, is_available, …)` for redeemables.
- `user_reward_balance (user_id PK, points)` with unique constraint on `user_id`.
- `point_transactions (id, user_id, kind enum(earn_report,earn_collect,redeem,adjust), amount, related_report_id nullable, related_redemption_id nullable, idempotency_key unique, created_at)` — append-only.
- Drop `Rewards` after data migration.

**Acceptance Criteria**
- [ ] Migration written + applied.
- [ ] `actions.ts` updated to single source of truth: balance = `SELECT points FROM user_reward_balance` (kept in sync via transactional updates).
- [ ] Idempotency keys prevent double-credit on retries.

**Dependencies:** KWM-013 (migrations infra)
**Testing Requirements:** integration test: report submission earns exactly +10 once even on duplicate POST.
**Definition of Done:** PR merged + staging migrated.

---

### KWM-012 · [BUG] Fix `getUserBalance` truncation by `LIMIT 10`
**Labels:** `bug` · `priority-critical` · `backend`

**Description**
`getUserBalance` calls `getRewardTransactions` which has `LIMIT 10` (`actions.ts:348`), silently truncating any user with > 10 lifetime transactions.

**Desired state**
- Balance is read from `user_reward_balance.points` directly (post KWM-011).
- `getRewardTransactions` accepts `{ limit, cursor }` and is used only for the activity list.

**Acceptance Criteria**
- [ ] `getUserBalance` does not depend on transaction pagination.
- [ ] Unit test: user with 50 earn txns reports correct balance.

**Dependencies:** KWM-011
**Testing Requirements:** see above.
**Definition of Done:** PR merged.

---

### KWM-013 · [INFRASTRUCTURE] Adopt Drizzle migrations (`drizzle-kit generate`) and remove `db:push` workflow
**Labels:** `infrastructure` · `database` · `priority-critical` · `devops`

**Description**
Switch from schema push to file-based migrations.

**Acceptance Criteria**
- [ ] `drizzle/` directory exists with first migration capturing current schema state.
- [ ] `package.json` scripts: `db:generate`, `db:migrate`, `db:studio`. `db:push` removed.
- [ ] Dev READMEs updated.
- [ ] CI runs `drizzle-kit migrate --dry-run` on PR.

**Dependencies:** none
**Testing Requirements:** fresh DB → run migrations → schema matches `schema.ts`.
**Definition of Done:** PR merged.

---

### KWM-014 · [DATABASE] Add indexes for hot query paths
**Labels:** `database` · `performance` · `priority-high`

**Description**
No FKs are indexed.

**Acceptance Criteria**
- [ ] Btree indexes:
  - `reports(user_id)`, `reports(status)`, `reports(collector_id)`, `reports(created_at)`
  - `notifications(user_id, is_read)`
  - `point_transactions(user_id, created_at)`
  - `collected_wastes(report_id)`, `collected_wastes(collector_id)`
- [ ] `EXPLAIN ANALYZE` archived in `docs/db/query-plans.md` for top 5 queries before and after.

**Dependencies:** KWM-013
**Testing Requirements:** plans show Index Scan, not Seq Scan.
**Definition of Done:** PR merged.

---

### KWM-015 · [DATABASE] Convert free-text status / type columns to Postgres enums
**Labels:** `database` · `priority-high`

**Description**
`Reports.status`, `Reports.wasteType`, `Notifications.type`, `Transactions.type`, `CollectedWastes.status` are all `varchar`. Use enums.

**Acceptance Criteria**
- [ ] `report_status` enum: `pending|approved|in_progress|collected|verified|rejected`.
- [ ] `waste_type` enum: `general|plastic|organic|metal|paper|ewaste|hazardous|other`.
- [ ] `notification_type`, `transaction_kind` enums.
- [ ] Migration handles existing rows.

**Dependencies:** KWM-013
**Testing Requirements:** invalid value insert returns 23514.
**Definition of Done:** PR merged.

---

### KWM-016 · [FEATURE] Add `audit_log` table and `audit()` helper
**Labels:** `feature` · `database` · `security` · `priority-high`

**Description**
Capture every privileged mutation: actor, action, target, before/after JSON, timestamp, request id.

**Acceptance Criteria**
- [ ] `audit_log` table + index on `(actor_user_id, created_at)`.
- [ ] `audit(action, target, before, after)` helper called from every admin action.
- [ ] Documented retention (default 1 year).

**Dependencies:** KWM-013
**Testing Requirements:** unit test on helper; integration test on one admin action.
**Definition of Done:** PR merged.

---

### KWM-017 · [SECURITY] Add Zod validation to every server action
**Labels:** `security` · `priority-critical` · `backend`

**Description**
Validate every input before DB call.

**Acceptance Criteria**
- [ ] One Zod schema per action, colocated in `utils/db/schemas/`.
- [ ] Action throws `ValidationError` (mapped to user-friendly toast).
- [ ] Unit tests on each schema's reject cases.

**Dependencies:** KWM-003
**Testing Requirements:** see above.
**Definition of Done:** PR merged.

---

### KWM-018 · [REFACTOR] Wrap multi-step mutations in `db.transaction()`
**Labels:** `bug` · `priority-high` · `backend`

**Description**
`createReport` and `redeemReward(0)` perform 2–4 writes non-atomically.

**Acceptance Criteria**
- [ ] Every multi-write action uses `db.transaction()`.
- [ ] Failure-injection test confirms rollback.

**Dependencies:** KWM-003, KWM-011
**Testing Requirements:** see above.
**Definition of Done:** PR merged.

---

### KWM-019 · [REFACTOR] Standardise server-action return type to `Result<T, ActionError>`
**Labels:** `refactor` · `priority-medium` · `backend`

**Description**
Replace silent `console.error → return null` with typed results so the UI can react.

**Acceptance Criteria**
- [ ] `type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string }`.
- [ ] Every action updated.
- [ ] UI consumes `.code` to show toast.

**Dependencies:** KWM-017
**Testing Requirements:** unit tests on error-code mapping.
**Definition of Done:** PR merged.

---

### KWM-020 · [REFACTOR] Eliminate `createCollectedWaste` / `saveCollectedWaste` duplication
**Labels:** `refactor` · `priority-medium` · `backend`

**Description**
Two functions insert into `CollectedWastes` with different default `status`.

**Acceptance Criteria**
- [ ] Single function `recordCollection({reportId, collectorId, status})`.
- [ ] All callers migrated.

**Dependencies:** KWM-019
**Testing Requirements:** unit + integration.
**Definition of Done:** PR merged.

---

### KWM-021 · [REFACTOR] Rename `Rewards.collectionInfor` → `collectionInfo`; fix `userInfor` typos
**Labels:** `refactor` · `priority-low`

**Description**
Repeated typos `Infor` should be `Info`.

**Acceptance Criteria**
- [ ] Schema column renamed (migration).
- [ ] All references updated.

**Dependencies:** KWM-011 (rewards rebuild may obviate this)
**Testing Requirements:** typecheck.
**Definition of Done:** PR merged.

---

### KWM-022 · [BUG] Replace deprecated `MediaQueryList.addListener` in `useMediaQuery`
**Labels:** `bug` · `priority-low` · `frontend`

**Description**
Use `addEventListener('change', …)` / `removeEventListener`.

**Acceptance Criteria**
- [ ] Updated.
- [ ] No deprecation warning in console.

**Dependencies:** none
**Testing Requirements:** Vitest with `matchMedia` mock.
**Definition of Done:** PR merged.

---

### KWM-023 · [BUG] Configure `drizzle.config.js` to load `.env`
**Labels:** `bug` · `priority-medium` · `devops`

**Description**
Without `import 'dotenv/config'`, `db:push` / `db:generate` silently no-op when `DATABASE_URL` isn't pre-exported.

**Acceptance Criteria**
- [ ] `dotenv` imported.
- [ ] Local dev works without manual `export`.

**Dependencies:** KWM-013
**Definition of Done:** PR merged.

---

### KWM-024 · [REFACTOR] Rename `utils/db/dbConfig.jsx` → `dbConfig.ts`
**Labels:** `refactor` · `priority-low`

**Description**
File contains no JSX and confuses tooling.

**Acceptance Criteria** - [ ] File renamed; imports updated.

**Dependencies:** none
**Definition of Done:** PR merged.

---

## Epic 2 — Waste Collection Operations

---

### KWM-025 · [FEATURE] Build `/report` page (citizen submits waste report)
**Labels:** `feature` · `frontend` · `priority-critical`

**Description**
Form for: location (map pin or "use my location"), waste type (enum from KWM-015), amount (numeric + unit), photo (one or more), optional notes.

**Current state:** sidebar links to `/report`, but no page exists.

**Desired state:** form using react-hook-form + Zod, optimistic submission, success state with earned-points display.

**Acceptance Criteria**
- [ ] Form schema in `app/report/schema.ts`.
- [ ] Map pin picker (Mapbox or Leaflet).
- [ ] Photo upload to signed URL (KWM-026).
- [ ] On submit calls `createReport` action via session-derived user id.
- [ ] Loading + error + success states.
- [ ] Mobile-first layout.
- [ ] axe-core a11y check passes.

**Dependencies:** KWM-004, KWM-017, KWM-026, KWM-049
**Testing Requirements:** Playwright happy path + 1 validation failure path.
**Definition of Done:** PR merged + E2E green.

---

### KWM-026 · [FEATURE] Implement signed-URL photo upload pipeline (R2 / S3)
**Labels:** `feature` · `backend` · `infrastructure` · `priority-critical`

**Description**
Citizens & operators upload images; persisted to object storage with signed URLs.

**Acceptance Criteria**
- [ ] `attachments` table (id, owner_user_id, object_key, mime, size, created_at).
- [ ] `POST /api/uploads/sign` returns a presigned PUT URL.
- [ ] Allowed MIMEs: jpeg/png/webp/heic; max 10 MB.
- [ ] Server-side MIME sniffing after upload.
- [ ] R2 bucket provisioned with CORS for the Vercel origin only.
- [ ] CDN public read on a `media.kiteezi-waste.example` subdomain.

**Dependencies:** KWM-005
**Testing Requirements:** integration test: PUT to signed URL, then read via CDN URL.
**Definition of Done:** PR merged + storage live.

---

### KWM-027 · [FEATURE] Build `/my-reports` page (citizen sees own report history)
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Paginated list with status, photo thumbnail, AI verdict, collector name.

**Acceptance Criteria**
- [ ] Cursor pagination.
- [ ] Filter by status.
- [ ] Empty + loading + error states.

**Dependencies:** KWM-025
**Testing Requirements:** Playwright list rendering.
**Definition of Done:** PR merged.

---

### KWM-028 · [DATABASE] `routes`, `route_stops`, `route_assignments` schema
**Labels:** `feature` · `database` · `priority-critical`

**Description**
Operations cannot exist without routes.

**Acceptance Criteria**
- [ ] `routes(id, name, zone_id, geometry geom, created_at, archived_at)`.
- [ ] `route_stops(id, route_id, sequence, lat, lng, expected_time)`.
- [ ] `route_assignments(id, route_id, operator_id, vehicle_id, scheduled_for, status)`.
- [ ] Migration + indexes on `(operator_id, scheduled_for)`.

**Dependencies:** KWM-013, KWM-029
**Definition of Done:** PR merged + staging migrated.

---

### KWM-029 · [DATABASE] `vehicles`, `vehicle_drivers`, `maintenance_logs` schema
**Labels:** `feature` · `database` · `priority-high`

**Description**
Vehicle fleet.

**Acceptance Criteria**
- [ ] `vehicles(id, plate unique, capacity_kg, status, current_driver_id, created_at)`.
- [ ] `vehicle_drivers(vehicle_id, driver_id, assigned_at, unassigned_at)`.
- [ ] `maintenance_logs(id, vehicle_id, kind, cost, note, occurred_at)`.

**Dependencies:** KWM-013
**Definition of Done:** PR merged + migrated.

---

### KWM-030 · [FEATURE] Build `/operator/today` page (assigned routes + reports)
**Labels:** `feature` · `frontend` · `priority-critical`

**Description**
Operator's daily worksheet: today's route stops + pending reports near them.

**Acceptance Criteria**
- [ ] Map (Mapbox) + list view toggle.
- [ ] Each stop tappable → check-in flow.
- [ ] Each report tappable → details + accept.
- [ ] Mobile-first; works on small screens.

**Dependencies:** KWM-028, KWM-034
**Testing Requirements:** Playwright mobile viewport.
**Definition of Done:** PR merged.

---

### KWM-031 · [FEATURE] Geo-bounded check-in flow for operator pickup
**Labels:** `feature` · `frontend` · `backend` · `priority-critical`

**Description**
At pickup, operator confirms with current GPS + proof photo. Server validates location is within N metres of the report.

**Acceptance Criteria**
- [ ] `collection_checkins(id, report_id, collector_id, lat, lng, photo_id, created_at)`.
- [ ] Server rejects if distance > 50 m unless `force_override` (admin only).
- [ ] Idempotency key prevents double check-in.

**Dependencies:** KWM-026, KWM-028
**Testing Requirements:** integration test: out-of-range rejects; admin override path works.
**Definition of Done:** PR merged.

---

### KWM-032 · [FEATURE] Supervisor inbox: pending reports list with bulk approve / reject
**Labels:** `feature` · `frontend` · `priority-critical`

**Description**
Supervisors triage citizen reports.

**Acceptance Criteria**
- [ ] `/supervisor/inbox` page.
- [ ] Filters by zone, waste type, AI confidence threshold.
- [ ] Bulk select + approve / reject with reason.
- [ ] Audit log written.

**Dependencies:** KWM-009, KWM-016
**Testing Requirements:** Playwright.
**Definition of Done:** PR merged.

---

### KWM-033 · [FEATURE] Build `/rewards` page (catalog + redemption)
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Citizens browse catalog and redeem.

**Acceptance Criteria**
- [ ] Cards per reward with cost + availability.
- [ ] Redeem button disabled if balance insufficient.
- [ ] Confirmation modal with idempotency key.
- [ ] Post-redeem balance is correct (KWM-012).

**Dependencies:** KWM-011, KWM-012
**Testing Requirements:** Playwright.
**Definition of Done:** PR merged.

---

### KWM-034 · [FEATURE] Add Mapbox integration (or MapLibre + OSM) + `<Map>` component
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Reusable map across report submission, operator console, supervisor live ops.

**Acceptance Criteria**
- [ ] `<Map>` component with markers, click-to-place pin, fit-to-bounds.
- [ ] Lazy-loaded; not in main bundle.
- [ ] Provider key in `NEXT_PUBLIC_MAPBOX_TOKEN`.

**Dependencies:** none
**Definition of Done:** PR merged.

---

## Epic 3 — Tracking & Monitoring

---

### KWM-035 · [INFRASTRUCTURE] Make the app a PWA (manifest + service worker)
**Labels:** `infrastructure` · `frontend` · `priority-high`

**Description**
Operator console must be installable + offline-tolerant.

**Acceptance Criteria**
- [ ] `next-pwa` (or hand-rolled SW).
- [ ] Manifest with icons + theme.
- [ ] Install prompt on supported devices.

**Dependencies:** none
**Definition of Done:** PR merged + Lighthouse PWA score 100.

---

### KWM-036 · [FEATURE] Background GPS pings while operator on shift (opt-in)
**Labels:** `feature` · `frontend` · `backend` · `priority-high`

**Description**
While the operator is "on shift", the PWA pings location every 30 s to `POST /api/gps`.

**Acceptance Criteria**
- [ ] Explicit consent screen + privacy policy link.
- [ ] `gps_pings(id, user_id, lat, lng, accuracy_m, recorded_at, route_assignment_id nullable)`.
- [ ] Server rate-limits to 1/15s per user.
- [ ] Battery-friendly throttle when stationary.

**Dependencies:** KWM-035, KWM-028
**Testing Requirements:** integration test on rate limit.
**Definition of Done:** PR merged.

---

### KWM-037 · [FEATURE] Supervisor "Live Ops" map
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Real-time vehicles, route progress, recent reports, incidents.

**Acceptance Criteria**
- [ ] SSE (`/api/live`) pushes deltas.
- [ ] Clustering for many markers.
- [ ] Click vehicle → operator + route + ETA.

**Dependencies:** KWM-034, KWM-036
**Definition of Done:** PR merged.

---

### KWM-038 · [DATABASE] `incidents` + `incident_evidence` + `incident_status_history` schema
**Labels:** `feature` · `database` · `priority-high`

**Description**
Operators file incidents; supervisors resolve.

**Acceptance Criteria** - [ ] Schema, indexes, FKs.

**Dependencies:** KWM-013
**Definition of Done:** PR merged.

---

### KWM-039 · [FEATURE] Operator: file incident
**Labels:** `feature` · `frontend` · `backend` · `priority-high`

**Description**
Form: type (hazard, blocked road, dispute, etc.), severity, photos, notes.

**Acceptance Criteria** - [ ] Page `/operator/incident` + server action + audit entry.

**Dependencies:** KWM-038, KWM-026
**Definition of Done:** PR merged.

---

### KWM-040 · [FEATURE] Supervisor: resolve incident workflow
**Labels:** `feature` · `frontend` · `backend` · `priority-high`

**Description**
Update status; resolution note; reassign.

**Acceptance Criteria** - [ ] Workflow + status timeline.

**Dependencies:** KWM-039
**Definition of Done:** PR merged.

---

### KWM-041 · [FEATURE] Offline-first queue for check-ins & incidents
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Queue mutations in IndexedDB; Background Sync API replays when online.

**Acceptance Criteria**
- [ ] Queue UX shows pending count.
- [ ] Idempotency keys prevent duplicate replay.
- [ ] Conflict resolution policy documented.

**Dependencies:** KWM-035, KWM-031, KWM-039
**Definition of Done:** PR merged.

---

### KWM-042 · [FEATURE] Route SLA timers & breach alerts
**Labels:** `feature` · `backend` · `priority-medium`

**Description**
Background job marks stops breached; supervisor notification.

**Acceptance Criteria** - [ ] Configurable per route; alerts via Notifications + email.

**Dependencies:** KWM-028, KWM-058
**Definition of Done:** PR merged.

---

## Epic 4 — AI Features

---

### KWM-043 · [FEATURE] `POST /api/ai/classify-waste` (Gemini Vision or OpenAI)
**Labels:** `feature` · `ai` · `backend` · `priority-high`

**Description**
Takes an image URL or upload key, returns `{ category, confidence, hazards }`. Caches by image hash.

**Acceptance Criteria**
- [ ] Provider chosen + key in secret manager.
- [ ] `ai_classification_runs(id, image_hash, provider, model_version, response jsonb, cost_usd, created_at)` and `model_versions` reference table.
- [ ] Per-user / per-day cost cap; circuit-breaker.

**Dependencies:** KWM-026, KWM-005
**Testing Requirements:** integration test against a mocked provider.
**Definition of Done:** PR merged.

---

### KWM-044 · [FEATURE] Surface AI verdict in citizen submission + supervisor inbox
**Labels:** `feature` · `frontend` · `priority-high`

**Description**
Citizens see suggested category (editable); supervisors see confidence chip.

**Acceptance Criteria** - [ ] UI integration; low-confidence flagged.

**Dependencies:** KWM-043, KWM-025, KWM-032
**Definition of Done:** PR merged.

---

### KWM-045 · [FEATURE] Duplicate-report detector via pgvector
**Labels:** `feature` · `ai` · `backend` · `priority-medium`

**Description**
Embed images and locations; flag near-duplicates within X hours and Y metres.

**Acceptance Criteria** - [ ] pgvector extension + ANN index; nightly job.

**Dependencies:** KWM-043
**Definition of Done:** PR merged.

---

### KWM-046 · [FEATURE] Fraud / free-mint heuristic
**Labels:** `feature` · `security` · `backend` · `priority-medium`

**Description**
Score per user; throttle when score above threshold; admin can review.

**Acceptance Criteria** - [ ] Background job; surfaced in admin UI.

**Dependencies:** KWM-045
**Definition of Done:** PR merged.

---

### KWM-047 · [FEATURE] Admin override / labeling UI for AI verdicts
**Labels:** `feature` · `frontend` · `ai` · `priority-medium`

**Description**
Admin can correct labels; exports become training data.

**Acceptance Criteria** - [ ] CSV export endpoint; admin UI.

**Dependencies:** KWM-043, KWM-052
**Definition of Done:** PR merged.

---

## Epic 5 — Reporting & Analytics

---

### KWM-048 · [FEATURE] KPI dashboard for admin/supervisor
**Labels:** `feature` · `frontend` · `analytics` · `priority-medium`

**Description**
Tons collected, on-time %, redemption rate, top zones, daily / weekly / monthly toggle.

**Acceptance Criteria** - [ ] Charts via recharts or visx; data-fetched via RSC + cache.

**Dependencies:** KWM-049, KWM-034
**Definition of Done:** PR merged.

---

### KWM-049 · [INFRASTRUCTURE] Daily aggregation job → `daily_metrics`
**Labels:** `infrastructure` · `backend` · `priority-medium`

**Description**
Inngest cron at 02:00 UTC aggregates the previous day's data into a materialised view / table.

**Acceptance Criteria** - [ ] Job + table + retries + alert on failure.

**Dependencies:** KWM-058
**Definition of Done:** PR merged.

---

### KWM-050 · [FEATURE] CSV / PDF report export
**Labels:** `feature` · `backend` · `priority-medium`

**Description**
Admin can export reports filtered by zone / date / type.

**Acceptance Criteria** - [ ] CSV via Web Streams; PDF via puppeteer or @react-pdf.

**Dependencies:** KWM-049
**Definition of Done:** PR merged.

---

### KWM-051 · [FEATURE] Scheduled monthly compliance email
**Labels:** `feature` · `backend` · `priority-low`

**Description**
Resend / Postmark sends monthly compliance summary on the 1st.

**Acceptance Criteria** - [ ] Job; templated email; opt-out.

**Dependencies:** KWM-050, KWM-059
**Definition of Done:** PR merged.

---

### KWM-052 · [FEATURE] Audit log search UI
**Labels:** `feature` · `frontend` · `priority-medium`

**Description**
Admin can filter the audit log by actor / target / action / date.

**Acceptance Criteria** - [ ] `/admin/audit` page; pagination; export.

**Dependencies:** KWM-016, KWM-009
**Definition of Done:** PR merged.

---

## Epic 6 — Security Hardening

---

### KWM-053 · [SECURITY] Add strict security headers via `middleware.ts`
**Labels:** `security` · `priority-critical`

**Description**
CSP, HSTS preload, Referrer-Policy strict-origin-when-cross-origin, X-Content-Type-Options nosniff, COOP `same-origin`, COEP `require-corp` (gated by review), Permissions-Policy.

**Acceptance Criteria** - [ ] All headers present; CSP allow-lists only required hosts (Web3Auth, Mapbox, R2).

**Dependencies:** KWM-006
**Testing Requirements:** `securityheaders.com` grade ≥ A.
**Definition of Done:** PR merged.

---

### KWM-054 · [SECURITY] Add Upstash Ratelimit on all mutating server actions
**Labels:** `security` · `priority-critical`

**Description**
Per-IP + per-user buckets. Defaults: 10 req / 10 s per user, 60 req / min per IP.

**Acceptance Criteria** - [ ] Wrapper helper; applied to `createReport`, redeem, check-in, incident, AI route.

**Dependencies:** KWM-009
**Definition of Done:** PR merged.

---

### KWM-055 · [SECURITY] Add Cloudflare Turnstile to citizen report submission
**Labels:** `security` · `priority-high`

**Description**
Bot mitigation on the report flow (which mints points).

**Acceptance Criteria** - [ ] Token verified server-side; failure path returns 403.

**Dependencies:** KWM-025
**Definition of Done:** PR merged.

---

### KWM-056 · [SECURITY] Dependency scanning: Dependabot + Snyk + `npm audit` on PRs
**Labels:** `security` · `priority-high`

**Description**
Automated CVE detection.

**Acceptance Criteria** - [ ] Dependabot configured; Snyk action in CI; high-sev CVE blocks merge.

**Dependencies:** KWM-061
**Definition of Done:** PR merged.

---

### KWM-057 · [SECURITY] External pen-test pre-launch + remediation
**Labels:** `security` · `priority-critical`

**Description**
Engage a vendor; remediate findings.

**Acceptance Criteria** - [ ] Engagement signed; report in `docs/security/`; remediation issues opened & closed.

**Dependencies:** Epics 1–6 substantially complete
**Definition of Done:** sign-off in `docs/security/pentest-2026-XX.md`.

---

## Epic 7 — Testing & Quality

---

### KWM-058 · [INFRASTRUCTURE] Adopt Inngest for background jobs
**Labels:** `infrastructure` · `priority-high`

**Description**
Reliable async job runtime.

**Acceptance Criteria** - [ ] Inngest installed; sample cron job; dashboard linked.

**Dependencies:** KWM-005
**Definition of Done:** PR merged.

---

### KWM-059 · [INFRASTRUCTURE] Adopt Resend (or Postmark) for transactional email
**Labels:** `infrastructure` · `priority-medium`

**Description**
Single sender domain; DKIM/SPF/DMARC aligned.

**Acceptance Criteria** - [ ] DNS records published; first template (welcome) sent.

**Dependencies:** KWM-005
**Definition of Done:** PR merged.

---

### KWM-060 · [TEST] Install Vitest + first ≥ 80 % coverage on `utils/db/actions.ts`
**Labels:** `testing` · `priority-critical`

**Description**
Bootstrap a unit test framework.

**Acceptance Criteria** - [ ] `vitest`, `@vitest/coverage-v8`; `npm test` script; CI runs it.

**Dependencies:** KWM-061
**Testing Requirements:** coverage report.
**Definition of Done:** PR merged + coverage badge.

---

### KWM-061 · [INFRASTRUCTURE] GitHub Actions CI: lint + typecheck + test + build on every PR
**Labels:** `infrastructure` · `priority-critical`

**Description**
Block merges on red.

**Acceptance Criteria**
- [ ] `.github/workflows/ci.yml` running on PR.
- [ ] Branch protection on `dev` and `main`.
- [ ] Status checks required.

**Dependencies:** none
**Definition of Done:** PR merged.

---

### KWM-062 · [TEST] Playwright E2E on 5 critical journeys
**Labels:** `testing` · `priority-critical`

**Description**
Login (citizen + operator + admin), citizen report happy path, operator check-in, supervisor approve, citizen redeem.

**Acceptance Criteria** - [ ] Playwright + GH Actions job; runs against per-PR Vercel preview.

**Dependencies:** KWM-061
**Definition of Done:** PR merged + first green run.

---

### KWM-063 · [TEST] Drizzle integration tests against per-PR Neon branch
**Labels:** `testing` · `priority-high`

**Description**
GH Action provisions a Neon branch, runs migrations, runs integration tests, tears down.

**Acceptance Criteria** - [ ] Workflow uses `neondatabase/create-branch-action` (or REST).

**Dependencies:** KWM-013, KWM-061
**Definition of Done:** PR merged.

---

### KWM-064 · [TEST] axe-core a11y checks integrated into Playwright
**Labels:** `testing` · `accessibility` · `priority-high`

**Description**
Each critical-journey E2E asserts no axe violations on key screens.

**Acceptance Criteria** - [ ] zero violations baseline; new violations fail PR.

**Dependencies:** KWM-062
**Definition of Done:** PR merged.

---

### KWM-065 · [TEST] Lighthouse CI budget on PRs (perf ≥ 80, a11y ≥ 90)
**Labels:** `testing` · `performance` · `priority-medium`

**Description**
Performance + a11y guardrails.

**Acceptance Criteria** - [ ] LHCI job; fails on budget breach.

**Dependencies:** KWM-061
**Definition of Done:** PR merged.

---

### KWM-066 · [TEST] k6 load test in nightly CI
**Labels:** `testing` · `performance` · `priority-medium`

**Description**
Scenarios: report submit, operator check-in, redeem.

**Acceptance Criteria** - [ ] p95 latency budget enforced.

**Dependencies:** KWM-061
**Definition of Done:** PR merged + first night green.

---

## Epic 8 — Infrastructure & Deployment

---

### KWM-067 · [INFRASTRUCTURE] Provision Vercel projects: prod, staging, preview
**Labels:** `infrastructure` · `priority-critical`

**Acceptance Criteria** - [ ] Three envs; envs wired; `dev` → staging, `main` → prod with manual promote.

**Dependencies:** KWM-005
**Definition of Done:** prod URL live (login wall).

---

### KWM-068 · [INFRASTRUCTURE] Provision Neon branches: dev / staging / prod with PITR ≥ 14 days
**Labels:** `infrastructure` · `priority-critical`

**Acceptance Criteria** - [ ] PITR enabled; backup retention documented.

**Dependencies:** KWM-067
**Definition of Done:** restore drill performed (KWM-070).

---

### KWM-069 · [INFRASTRUCTURE] Add `Dockerfile` + `docker-compose.yml` for local DB + non-Vercel deploys
**Labels:** `infrastructure` · `priority-medium`

**Acceptance Criteria** - [ ] `docker compose up` brings up Postgres locally; image builds clean.

**Dependencies:** none
**Definition of Done:** PR merged.

---

### KWM-070 · [INFRASTRUCTURE] DR runbook + first restore drill
**Labels:** `infrastructure` · `priority-high` · `documentation`

**Acceptance Criteria** - [ ] `docs/runbook/dr.md`; drill log dated; recovery objectives defined.

**Dependencies:** KWM-068
**Definition of Done:** drill completed.

---

### KWM-071 · [INFRASTRUCTURE] Sentry: capture all unhandled errors with stack + breadcrumbs
**Labels:** `infrastructure` · `observability` · `priority-critical`

**Acceptance Criteria** - [ ] `@sentry/nextjs` configured; PII scrubbing; release versioning; source maps.

**Dependencies:** KWM-067
**Definition of Done:** test error visible in Sentry.

---

### KWM-072 · [INFRASTRUCTURE] OpenTelemetry → Grafana Cloud / Honeycomb (traces + metrics)
**Labels:** `infrastructure` · `observability` · `priority-high`

**Acceptance Criteria** - [ ] Server actions instrumented; traces visible.

**Dependencies:** KWM-067
**Definition of Done:** PR merged.

---

### KWM-073 · [INFRASTRUCTURE] Better Uptime synthetic monitor + Statuspage
**Labels:** `infrastructure` · `observability` · `priority-medium`

**Acceptance Criteria** - [ ] 1-min ping on critical endpoints; statuspage URL published.

**Dependencies:** KWM-067
**Definition of Done:** monitor green.

---

### KWM-074 · [DOCUMENTATION] Rewrite README for project; add ARCHITECTURE, CONTRIBUTING, SECURITY
**Labels:** `documentation` · `priority-critical`

**Acceptance Criteria** - [ ] README, ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE.

**Dependencies:** none
**Definition of Done:** PR merged.

---

### KWM-075 · [INFRASTRUCTURE] Per-SEV runbooks + on-call rotation
**Labels:** `infrastructure` · `documentation` · `priority-medium`

**Acceptance Criteria** - [ ] SEV-1/2/3 runbooks; PagerDuty (or similar) rotation; escalation policy.

**Dependencies:** KWM-071
**Definition of Done:** first practice page acknowledged.

---

## Epic 9 — Production Readiness

---

### KWM-076 · [FEATURE] Privacy policy + ToS published; data-subject access workflow
**Labels:** `priority-high` · `security` · `documentation`

**Acceptance Criteria** - [ ] Pages live; legal review done; in-app link in footer; export-my-data endpoint.

**Dependencies:** KWM-074
**Definition of Done:** PR merged + page live.

---

### KWM-077 · [TEST] Pre-launch acceptance sign-off (rolls up the Production Readiness checklist)
**Labels:** `priority-critical` · `testing`

**Description**
Gating issue tracking every checkbox in `PRODUCTION_READINESS_REPORT.md §4`.

**Acceptance Criteria** - [ ] Every box ticked with evidence link.

**Dependencies:** all prior issues in Epics 1–8.
**Definition of Done:** sign-off in `docs/launch/v1-acceptance.md` by tech lead + product + security.

---

## Issue Coverage Summary

| Epic | Issues | Range |
|------|-------:|-------|
| 1 — Core Platform Foundation | 24 | KWM-001 … KWM-024 |
| 2 — Waste Collection Ops | 10 | KWM-025 … KWM-034 |
| 3 — Tracking & Monitoring | 8 | KWM-035 … KWM-042 |
| 4 — AI Features | 5 | KWM-043 … KWM-047 |
| 5 — Reporting & Analytics | 5 | KWM-048 … KWM-052 |
| 6 — Security Hardening | 5 | KWM-053 … KWM-057 |
| 7 — Testing & Quality | 9 | KWM-058 … KWM-066 |
| 8 — Infrastructure & Deployment | 9 | KWM-067 … KWM-075 |
| 9 — Production Readiness | 2 | KWM-076 … KWM-077 |
| **Total** | **77** | |

Every issue above is independently mergeable, testable, and deployable. Dependencies are listed explicitly so a PM can build a Gantt without re-reading the codebase.

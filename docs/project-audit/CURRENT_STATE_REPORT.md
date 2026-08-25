# Kiteezi — Current State Report

**Report date:** 2026-08-25
**Branch audited:** `dev` @ `c410896` (clean working tree, no stashes)
**Baseline compared against:** `EXECUTIVE_SUMMARY.md`, dated 2026-06-18
**Method:** current working tree, source, tests (run), git history, branches, GitHub issues/PRs/CI, existing audit docs. Verification commands were executed; claims below are evidence-anchored.

---

## 1. Executive Status

**Overall: YELLOW**

Since the 2026-06-18 audit the project has done a large amount of genuinely high-quality work: Epic 1 (Core Platform Foundation) is essentially complete, and a six-phase Clean Architecture refactor (PRs #98–#103) restructured the entire backend into `src/modules/{auth,rewards,reports,notifications,collection}` with domain/application/infrastructure/presentation layers, ports, in-memory fakes, and 147 passing tests. The **backend foundation is now trustworthy**. The problem is that **almost none of it is reachable by a user**: the production build emits exactly one page (`/`) and that page is empty. Roughly 20 server actions exist; the UI calls 3 of them.

| Metric | Value |
|---|---|
| Estimated completion state | Backend foundation ~substantially done; **product surface ~unchanged since the last audit**. A single overall % is not justifiable — the two halves diverge sharply. |
| Current development state | **Dormant.** Last commit 2026-08-04; 21 days idle. Clean tree, no stashes, no unmerged local work of value. |
| Biggest concern | A well-architected, well-tested engine with **no vehicle attached** — plus authorization enforcement living entirely in an untested layer. |

Verified green: `npm test` 147/147 pass · `npm run lint` clean · `npm run build` succeeds · `tsc --noEmit` exit 0 (after a build) · CI 20/20 green runs.

---

## 2. What Changed Since Last Session

Baseline = `EXECUTIVE_SUMMARY.md`, dated 2026-06-18. **321 commits, 12 merged PRs** since.

| Area | Previous State | Current State | Change |
|---|---|---|---|
| Secrets | `.env` committed; `DATABASE_URL` in client bundle | `.env` purged from all history; gitignored; `next.config.mjs` clean | **FIXED** (C-1, C-2) |
| Authentication | `localStorage.email` | Server-side Web3Auth JWKS verification, HS256 session cookie (`__Host-` in prod), `/api/auth/{session,me,logout}` | **FIXED** (C-3) |
| Authorization | None — actions trusted client `userId` | `roles`/`user_roles` tables, `requireUser/requireRole/requireOwnership`, applied at every action | **FIXED** (C-4) |
| Server boundary | No `"use server"` | Every `*.actions.ts` has `"use server"` | **FIXED** (C-5) |
| Reward model | Conflated balance/catalog/ledger | `point_transactions` (signed, idempotency-keyed) + `user_reward_balance` (CHECK ≥ 0) + `reward_catalog`; `SELECT … FOR UPDATE` in a real transaction | **FIXED** (C-6, C-7) |
| Migrations | None on disk, `db:push` | 6 committed Drizzle migrations + journal; `db:push` removed | **FIXED** (C-8) |
| CI / tests | Neither existed | GitHub Actions (lint/typecheck/test/build); Vitest, 147 tests | **FIXED** (C-9) |
| Layout | `"use client"` root layout | Server Component + `AppShell` client boundary | **FIXED** (C-11) |
| Indexes | PKs only | Indexes on all hot paths | **FIXED** (C-12) |
| Architecture | Flat `utils/db/actions.ts` god-module | Clean Architecture, 5 modules, ports + adapters, `Result<T,E>` | **NEW — major** |
| **Pages / routes** | 1 empty page, 4 dead sidebar links | **1 empty page, 5 dead sidebar links** | **UNCHANGED** (C-10 still true) |
| GitHub issue hygiene | 77 issues filed | 59 open / 19 closed; **zero comments on any issue**, no milestones, no epic labels | **Drifted** |

### Timeline of significant change

| Date | Event |
|---|---|
| 2026-06-18 | Baseline audit merged (PR #6); Next.js CVE bump (#7); secret rotation + `.env` purge (#88) |
| 2026-06-19 | DB foundation — migrations, indexes, enums, `audit_log` (#90); arch cleanup (#91); `"use server"` (#92); server-side session + session-derived identity (#93) |
| 2026-06-24 | CI (#94); Vitest (#95); RBAC roles + enforcement (#96); Zod validation everywhere (#97) |
| 2026-08-03 | Phase 0 — `src/` layout (#98) |
| 2026-08-04 | Phases 1–3c — rewards (#99), auth (#100), notifications (#101), reports (#102), collection (#103) modules extracted; legacy `utils/db/actions.ts` deleted |
| 2026-08-04 → 2026-08-25 | **No activity.** |

### Work status classification

- **Completed:** Epic 1; the full Clean Architecture refactor. All 12 PRs merged CI-green; no reverts, no abandoned branches of value.
- **Merged but never validated:** everything. No feature has been exercised against a real database or a real user — no page consumes the write paths.
- **Started, never finished:** audit-log wiring; legacy reward-table retirement; report status-transition rules; Drizzle-adapter contract runs.
- **Exists locally, unmerged:** nothing of value. Stale local branches `feature/header-component`, `feature/side-bar` (Oct 2025, already merged upstream); `audit/project-discovery-and-roadmap` and `fix/next-cve-bump` track deleted remotes.
- **Planned, never started:** Epics 2–5 and 8–9 in their entirety.

---

## 3. Current State

| Area | Status | Evidence |
|---|---|---|
| Architecture | **DONE (backend)** | `src/modules/*/{domain,application,infrastructure,presentation}`; 5 modules; per-module `composition.ts`; domain layer has zero Drizzle imports (verified in `reports/domain/report.ts`) |
| Authentication | **PARTIAL** | Works end-to-end. Gap: `web3auth-identity-provider.adapter.ts:12` calls `jwtVerify(idToken, JWKS, {algorithms:['ES256']})` with **no `audience`/`issuer` check**; logout only clears the cookie — the JWT stays valid for its 7-day `exp` |
| Authorization | **PARTIAL** | Guards present at every action; policy logic unit-tested. **But no test asserts a guard is actually wired at any call site** — all `*.actions.ts` are untested |
| Database | **DONE** | 6 migrations 0000–0005, journal consistent, enums, FKs, indexes, CHECK constraints. `scripts/reward-migration-check.mjs` validates the 0005 backfill on synthetic data |
| Core domain | **DONE** | Rewards ledger, report status, notifications, collection — all modeled, all unit-tested |
| Features | **NOT STARTED** | Build manifest: `/`, `/_not-found`, 3 API routes. Nothing else exists |
| Testing | **PARTIAL** | 147/147 pass; domain + application well covered; **all adapters, all actions, all routes, all components untested** |
| CI/CD | **PARTIAL** | CI green on every PR. No CD, no deploy target, no environments |
| Security | **PARTIAL** | Big wins landed. Missing: `middleware.ts` (no security headers — file does not exist), no rate limiting, no CSRF/captcha, `audit()` helper has **zero call sites** |
| Infrastructure | **NOT STARTED** | No Dockerfile, no IaC, no staging/prod envs, no backups (KWM-067–070 all open) |
| Observability | **NOT STARTED** | `console.error` only. No Sentry, no OTel, no structured logging, no request IDs |

---

## 4. Done

- **Epic 1 — Core Platform Foundation**, all deliverables land except audit-log wiring and true logout invalidation.
- Secret leak fully remediated: `.env` absent from `git log --all -- .env`.
- Server-side session auth: JWKS token verification → user upsert → default `citizen` role → signed cookie.
- RBAC schema + enforcement primitives, with a correct ownership check in `mark-notification-read.usecase.ts`.
- Reward ledger rebuild — the strongest code in the repo: atomic `FOR UPDATE` + append + materialized-balance upsert, idempotency keys with `onConflictDoNothing`, DB-level non-negative CHECK.
- Drizzle migration discipline, including hand-hardened enum conversion and a documented no-`db:push` rule.
- Clean Architecture refactor across 5 modules, each PR CI-green, legacy `utils/db/actions.ts` fully deleted.
- CI gating lint + typecheck + test + build on every PR.

---

## 5. Half-Done / Needs Completion

**This is the section that matters most.**

| # | Item | What exists | What's missing | DONE when |
|---|---|---|---|---|
| 1 | **The application itself** | ~20 server actions, fully guarded and validated | Every page. `Sidebar.tsx:6-12` links `/report`, `/collect`, `/rewards`, `/leaderboard`, `/settings` — **all five 404**. `page.tsx` is a commented-out Create-Next-App template | At least the citizen loop (`/report`, `/my-reports`) and one ops surface render and call the existing actions |
| 2 | **Action-layer test coverage** | 147 tests over domain + use-cases, using in-memory fakes | Zero tests on `*.actions.ts`. Deleting `await requireRole(REVIEW_ROLES)` from `report.actions.ts:83` would leak every pending report to any citizen — **and the suite would still pass 147/147** | Each action has a test asserting it rejects unauthenticated / wrong-role callers |
| 3 | **Coverage configuration** | `test:coverage` runs | `vitest.config.ts:19` sets `include: ['lib/**','utils/db/**']` — pre-`src/` paths. It measures **2 files / 68 statements** and reports 66%, while ignoring all of `src/modules/**`. The number is meaningless | `include` points at `src/**`; a real baseline is recorded |
| 4 | **Drizzle adapters** | All 5 contract test suites written and passing | They run **only against in-memory fakes**. Each file says so explicitly ("re-run against Drizzle… once a live Postgres is available in CI — intentionally NOT wired up"). No SQL is ever executed by a test | Contract suites re-run against a real Postgres (KWM-063) |
| 5 | **Audit logging** | `audit_log` table, index, and `audit()` helper (`src/utils/db/audit.ts`) | `grep -rn "audit("` over `src` returns **no call sites**. It is dead code. KWM-016 is CLOSED | Called from every privileged mutation with actor + before/after |
| 6 | **Report status workflow** | `validateStatusTransition()` routes both write paths through one function | It is a **pass-through returning its argument** (`report.ts:32`). Any status can jump to any status — `pending → verified` with no collection | A product-defined transition table + tests |
| 7 | **Legacy reward tables** | New ledger live | Old `Rewards` / `Transactions` tables still in `schema.ts`, awaiting "a verification soak". Two models coexist | Retirement migration lands, or a decision is recorded |
| 8 | **Logout** | Cookie cleared | Token is a stateless JWT with a 7-day `exp`; a captured cookie survives logout. Epic 1 promised "logout that invalidates server-side state" | Server-side session/revocation list, or a much shorter `exp` + refresh |
| 9 | **Docs drift** | `docs/db/migrations.md` is good | Its history table stops at `0003`; 0004/0005 undocumented. Paths still say `utils/db/schema.ts` (now `src/utils/db/`) | Regenerated post-refactor |

---

## 6. Not Started / Missing

- **Every product feature**: report submission, collection workflow, rewards redemption UI, leaderboard, settings, admin/supervisor surfaces.
- **Photo upload** (KWM-026) — `Reports.imageUrl` exists; no pipeline behind it.
- **Security middleware**: no `middleware.ts` → no CSP/HSTS/X-Frame-Options; no rate limiting on mutating actions (KWM-053, KWM-054).
- **Observability**: no error tracking, no tracing, no structured logs (KWM-071, KWM-072).
- **Deployment**: no Vercel/Neon environments, no Docker, no DR plan (KWM-067–070).
- **E2E / integration testing**: no Playwright, no real-DB tests (KWM-062, KWM-063).
- **Dependency scanning**: `npm audit` reports **39 vulnerabilities (13 high, 10 moderate)** — mostly transitive via `@web3auth → ethers → ws`. No Dependabot (KWM-056).
- **AI, GPS/routes/vehicles, analytics** — Epics 3–5, entirely unstarted.

---

## 7. Testing Health

**Rating: ADEQUATE for the domain layer · WEAK overall**

| Metric | Value |
|---|---|
| Test files / tests | 47 / **147** |
| Pass / fail / skipped | **147 / 0 / 0** (15.7s) |
| Coverage | **Not meaningfully measured** — config scoped to stale pre-`src/` paths; reported 66% covers 68 statements in 2 files |
| Flaky tests | None observed (two clean consecutive runs) |

**Distribution:** rewards 12 files · auth 10 · reports 10 · notifications 5 · collection 4 · shared 4 · schemas/smoke 2.

**Well tested:** reward ledger invariants, point-transaction construction, authorization policy, all 22 use-cases against fakes, all Zod presentation schemas, `Result`/`AppError` plumbing.

**Untested:** every Drizzle adapter · every server action (and therefore every guard wiring) · all 3 API routes · every React component · `validation.ts` error mapping in situ · migrations.

**E2E status:** none. No Playwright, no harness, and no user-facing flow to exercise.
**Integration status:** none. Every "integration" test resolves to an in-memory fake; zero SQL statements execute under test.

**Regression protection by area:**

| Area | Protected? |
|---|---|
| Rewards / points / transactions | ✅ Strong — invariants, idempotency, redeem-all all covered |
| Validation | ✅ Schemas covered |
| Authorization *policy* | ✅ Covered |
| Authorization *enforcement* | ❌ **No** — a removed guard is invisible to the suite |
| Authentication flow | ⚠️ Use-cases covered; JWKS adapter and routes are not |
| Ownership | ⚠️ Only the notifications path exists and is covered |
| Database mutations | ❌ **No** — no SQL is executed by any test |
| Error handling | ⚠️ Result-mapping covered; action-level swallow/rethrow behavior is not |
| Critical user flows | ❌ **No E2E, and no flows to test** |

**Biggest weakness:** authorization is enforced exclusively in the one layer with zero test coverage.

---

## 8. Architecture Health

**Rating: STRONG (backend) / CRITICAL (product surface)**

1. **The layering is real, not cosmetic.** Domain has no framework or ORM imports — `report.ts` re-declares its own status union specifically to avoid a type-only Drizzle dependency. Ports are consumed as interfaces; every module has both a Drizzle and an in-memory adapter. This is unusually disciplined for a project this size.
2. **Transaction handling is the standout.** The `wrapExistingTx` / `DrizzleRewardTransactionManager` pair lets `createReport` mint points inside its *own* open transaction while `redeemReward` opens its own — one use-case, two composition modes, atomicity preserved in both. The dual-client split (`neon-http` for reads, `neon-serverless` Pool for transactions) is correctly reasoned and documented.
3. **Deliberate bug-compatibility is now technical debt.** Every `*.actions.ts` header states it preserved the legacy swallow-vs-rethrow inconsistency "deliberately, not normalized away." That was right *during* a refactor. It now means `createReport` returns `null` on failure while `redeemReward` throws — callers cannot handle errors uniformly. **KWM-019 (`Result<T, ActionError>` at the boundary) is the correct next cleanup and is still open.**
4. **`src/utils/db/` is the remaining seam.** `schema.ts`, `dbConfig.ts`, `txClient.ts`, and dead `audit.ts` sit outside the module structure, and modules reach into them directly (including `Role` imported from `schema.ts` into presentation code). It works, but it is the one place the dependency rule is bent.
5. **Inverted delivery pyramid.** The infrastructure is production-grade beneath a product that does not exist. No circular dependencies, no God modules, no global mutable state — but also no user-facing value. Further backend abstraction would be premature; the risk now is over-engineering, not under-engineering.

---

## 9. Risks / Blockers

| P | Risk | Evidence |
|---|---|---|
| **P0** | **Web3Auth token not audience-bound.** `verifyToken` validates signature + algorithm against Web3Auth's shared JWKS but checks no `aud`/`iss`. A token minted for *any other* Web3Auth application appears valid here, and `establish-session` trusts its `email` claim to select-or-create the user | `web3auth-identity-provider.adapter.ts:12` |
| **P0** | **Authorization enforcement is untested.** Guards are correct today; nothing prevents silent removal tomorrow | No test file for any `*.actions.ts` |
| **P1** | **Product surface is empty.** 21 days idle with a backend that no one can use; risk of further drift before any of it is validated against real usage | Build manifest: 1 page |
| **P1** | **No security middleware or rate limiting.** Mutating actions are unthrottled; no CSP/HSTS | `middleware.ts` absent |
| **P1** | **13 high-severity dependency CVEs**, unmonitored | `npm audit` |
| **P2** | **Coverage metric is false comfort** — will be quoted as "66%" | `vitest.config.ts:19` |
| **P2** | **GitHub board no longer reflects reality** — see §11. A new engineer reading issues would redo finished work | 0 comments across 78 issues |

---

## 10. Recommended Next Steps

The repository **is architecturally ready for feature development.** The layering, ports, transaction handling, and domain tests are sound, and the actions needed by a first vertical slice already exist and are guarded. Do *not* start another refactor. Do close two safety gaps first — both are small.

1. **Bind Web3Auth token verification to your client ID** → *Why:* the one finding that undermines every other auth control; a cross-app token currently authenticates. → *Dependency:* none. → *Done when:* `jwtVerify` passes `audience: process.env.NEXT_PUBLIC_WEB3_AUTH_CLIENT_ID` (+ `issuer`), and a test proves a wrong-`aud` token is rejected.

2. **Add authorization tests at the action boundary** → *Why:* the guards are the entire security model and nothing pins them down. → *Dependency:* none (fakes already exist). → *Done when:* each exported action has tests for unauthenticated, wrong-role, and correct-role callers.

3. **Fix `vitest.config.ts` coverage `include` to `src/**` and record the real baseline** → *Why:* you cannot manage what you are mis-measuring; 5-minute change. → *Dependency:* none. → *Done when:* coverage reports on `src/modules/**` and the true number is written down.

4. **Reconcile GitHub with the code** → *Why:* KWM-011, KWM-012, KWM-018, KWM-020 are **implemented but OPEN**; KWM-016 (`audit_log`) is **CLOSED but its helper has zero call sites**; KWM-060's criterion targets a deleted file. The board actively misleads. → *Dependency:* none. → *Done when:* statuses match reality and Epic 1 is marked complete.

5. **Build the first vertical slice: `/report` + `/my-reports`** → *Why:* proves the whole stack end-to-end against a real database for the first time, and turns a backend into a product. `createReport` and `getReportsByUserId` are already written, guarded, and validated. → *Dependency:* steps 1–2. → *Done when:* a citizen signs in, submits a report, sees +10 points in the header, and finds it in their history — against real Postgres.

6. **Wire `audit()` into privileged mutations** → *Why:* the table and helper are already paid for; it's currently dead code with a closed ticket. → *Dependency:* step 5 (so there are real mutations to record). → *Done when:* status changes and point grants write audit rows with actor + before/after.

7. **Add `middleware.ts` with security headers, and enable Dependabot** → *Why:* cheapest remaining production-readiness wins; addresses the 13 high CVEs. → *Dependency:* none. → *Done when:* CSP/HSTS/X-Frame-Options ship and dependency PRs open automatically.

**Explicitly do not touch yet:** the module/port structure (it is correct — leave it alone), the legacy `Rewards`/`Transactions` tables (retire them after a real soak, not before), report status-transition rules (needs product input first), and anything in Epics 3–5.

---

## 11. Appendix A — Roadmap / Issue Reconciliation

`59 open / 19 closed` of 78 issues. Zero comments on any issue; no milestones; all 77 KWM issues carry the same two generic labels. Items where GitHub state disagrees with the code:

| Item | GitHub | Real Status | Evidence | Remaining Work |
|---|---|---|---|---|
| KWM-011 Rebuild `Rewards` schema | OPEN | **DONE** | Migration `0005_reward_ledger.sql`; `reward_catalog` / `user_reward_balance` / `point_transactions` in `schema.ts` | Close it; retire legacy tables |
| KWM-012 `getUserBalance` `LIMIT 10` truncation | OPEN | **DONE** | `get-balance.usecase.ts` reads the materialized balance, never sums a page | Close it |
| KWM-018 Wrap mutations in `db.transaction()` | OPEN | **DONE** | `txClient.ts` + `DrizzleRewardLedgerUnitOfWork` + `wrapExistingTx` | Close it |
| KWM-020 Dedupe `createCollectedWaste`/`saveCollectedWaste` | OPEN | **DONE** | Single `recordCollection` use-case; both names are thin wrappers | Close it |
| KWM-016 `audit_log` table + helper | **CLOSED** | **PARTIAL** | Table + `audit()` exist; **zero call sites** | Wire into privileged mutations |
| KWM-060 Vitest + ≥80% on `utils/db/actions.ts` | OPEN | **SUPERSEDED** | Vitest installed, 147 tests; target file deleted in Phase 3c | Restate against `src/modules/**` |
| KWM-019 `Result<T, ActionError>` at boundary | OPEN | **NOT STARTED** | Actions still return `null`/`[]` or throw, inconsistently by design | Normalize now that the refactor is over |
| KWM-021 `collectionInfor` typo | OPEN | **NOT STARTED** | `schema.ts` still declares `collectionInfor: text('collection_info')` | Rename with legacy-table retirement |
| KWM-005 Secrets to Vercel/Doppler | OPEN | **BLOCKED** | No Vercel project exists yet | Depends on KWM-067 |
| KWM-010 / KWM-004 session identity | CLOSED | **PARTIAL** | Session works; logout does not invalidate server-side state as Epic 1 specified | Revocation or short `exp` + refresh |
| Epic 1 overall | 4 issues still open | **DONE** | All deliverables shipped across PRs #88–#97 | Mark complete |
| Epics 2–5, 8–9 | OPEN | **NOT STARTED** | No pages, no AI, no GPS, no analytics, no infra | — |

## Appendix B — Old Report Claim Validation

| Old claim | Verdict |
|---|---|
| C-1 `.env` committed | **FIXED** — purged from history |
| C-2 `DATABASE_URL` in client bundle | **FIXED** |
| C-3 No server-side auth | **FIXED** |
| C-4 Actions trust client `userId` | **FIXED** |
| C-5 No `"use server"` | **FIXED** |
| C-6 `Rewards` mis-modelled | **FIXED** |
| C-7 `getUserBalance` `LIMIT 10` | **FIXED** |
| C-8 No migrations on disk | **FIXED** |
| C-9 No CI / tests / lint gate | **FIXED** |
| **C-10 Sidebar advertises routes that 404** | **STILL TRUE** — now 5 dead links |
| C-11 `layout.tsx` is `"use client"` | **FIXED** |
| C-12 No indexes | **FIXED** |
| "Production-readiness 10/100, NO-GO" | **STILL TRUE** as NO-GO, but the score is materially outdated — the foundation improved substantially while deployment, observability, and product surface did not |
| "≈9% of the brief delivered" | **OUTDATED and not re-derivable** — backend foundation advanced greatly, feature surface did not; a single figure would mislead either way |
| "Tests of any kind: missing" | **FIXED** for domain/application; **STILL TRUE** for integration, E2E, adapters, actions |
| "README is unaltered Create-Next-App template" | **STILL TRUE** (KWM-074 open) |
| "No documentation" | **PARTIALLY FIXED** — `docs/db/`, `docs/security/` added; both now drifting post-refactor |

---

## 12. One-Line Conclusion

**Close the token-audience and untested-guard gaps this week, then stop building backend and ship the `/report` → `/my-reports` vertical slice — the foundation is sound, but nothing has ever been proven against a real user or a real database.**

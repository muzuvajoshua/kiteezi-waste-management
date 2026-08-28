# USER FLOW ANALYSIS
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18

Legend:
- ✅ **Built & working**
- 🟡 **Partial / broken / scaffolded**
- ❌ **Missing entirely**

> All assessments are anchored to code on branch `dev` at audit time. Nothing in this document is speculative; every "✅" item is traceable to a function or component cited inline.

---

## 1. Identified Roles

| Role | In code? | Code evidence | Status |
|------|----------|---------------|--------|
| Citizen / Reporter | implied | `Reports.user_id`, `/report` link in Sidebar | role concept ❌ ; page ❌ |
| Field Operator / Collector | implied | `Reports.collector_id`, `CollectedWastes`, `/collect` link | role concept ❌ ; page ❌ |
| Supervisor | not in code | — | ❌ |
| Administrator | not in code | — | ❌ |
| Dump-site operator | not in code | — | ❌ |
| Vehicle driver | not in code | — | ❌ |
| Reward redeemer (any user) | implied | `Rewards`, `Transactions`, `/rewards` link | page ❌ |

> The **`Users` table has no `role` column**. Until that is added, all "role-based" flows below are aspirational.

---

## 2. Administrator Flows

### 2.1 Admin login
- ❌ **Missing.** No admin login. Login is the same Web3Auth modal for all users; no role check on success.

### 2.2 Admin dashboard
- ❌ **Missing.** No admin dashboard page. No KPI widgets, no map, no live status feed.

### 2.3 User management
- ❌ **Missing.** No "list users" page, no role assignment UI, no deactivate/suspend.
- Backend support: only `createUser` and `getUserByEmail` exist (`utils/db/actions.ts:5`, `:15`). No list / update / delete / role mutation functions.

### 2.4 Vehicle management
- ❌ **Missing.** No `vehicles` table, no UI, no API.

### 2.5 Route management
- ❌ **Missing.** No `routes` / `route_stops` / `route_assignments` tables, no UI, no map.

### 2.6 Waste collection management (oversight)
- 🟡 **Partial.** `getPendingReports` (`actions.ts:186`) and `getRecentReports` (`actions.ts:210`) and `getWasteCollectionTasks` (`actions.ts:225`) exist as DB functions but **no UI consumes them**.

### 2.7 Reports
- ❌ **Missing.** No reporting UI. No CSV/PDF export. No filter/segment.

### 2.8 Analytics
- ❌ **Missing.** No charts (`recharts`/`chart.js` not installed). No analytics tables / views. No KPIs computed anywhere.

### 2.9 AI tools
- ❌ **Missing.** `Reports.verificationResult jsonb` column exists as a placeholder; no AI client, no model integration, no UI.

### 2.10 Settings
- ❌ **Missing.** Sidebar links to `/settings`; the route does not exist.

---

## 3. Field Operator Flows

### 3.1 Operator login
- 🟡 **Same login path as everyone.** Web3Auth modal; no role detection; no "operator console" landing.

### 3.2 View assigned routes
- ❌ **Missing.** No routes concept in schema. No "my assignments" view.

### 3.3 Collection tracking (in-progress trip)
- ❌ **Missing.** No live GPS, no checkin/checkout API, no map.

### 3.4 Collection completion
- 🟡 **DB scaffolded; no UI.**
  - `updateTaskStatus(reportId, status, collectorId)` (`actions.ts:294`) can mark a report `in_progress` / `collected`.
  - `saveCollectedWaste(reportId, collectorId)` (`actions.ts:275`) and `createCollectedWaste(reportId, collectorId)` (`actions.ts:123`) **overlap and conflict** — one defaults `status='collected'`, the other forces `status='verified'`. ⚠️
  - `saveReward(userId, amount)` (`actions.ts:251`) is called nowhere.
  - **No UI** for "submit collected" anywhere.

### 3.5 Incident reporting (operator side)
- ❌ **Missing.** No `incidents` table. No photo upload pipeline (S3/Cloudinary/UploadThing not installed). `Reports.imageUrl` is a string column, but no upload code exists.

---

## 4. Supervisor Flows

### 4.1 Monitoring
- ❌ **Missing.** No live operations dashboard. No map. No SLA timers.

### 4.2 Reporting
- ❌ **Missing.** See §2.7.

### 4.3 Route oversight
- ❌ **Missing.** No `routes` concept, no assignment workflow.

---

## 5. Citizen Flows

### 5.1 Citizen login / signup
- 🟡 **Partial.** Web3Auth Modal opens, returns a user-info object, and the email is persisted via `createUser`.
  - ⚠️ `createUser` silently swallows duplicate-email errors and returns `null` — first-time vs. returning user is indistinguishable to the caller (`actions.ts:5–13`).
  - ⚠️ Email is stored in `localStorage` (`Header.tsx:108`) — used downstream as the *identity primitive*. No signed token, no CSRF, no server-side session.

### 5.2 Report waste
- ❌ **Missing UI.** The `/report` sidebar link 404s.
- 🟡 **Backend scaffold:** `createReport(userId, location, wasteType, amount, imageUrl?, type?, verificationResult?)` (`actions.ts:31`) inserts a Report **and** awards 10 points **and** creates a transaction **and** sends a notification — all in one non-transactional sequence. ⚠️ Partial failure mid-sequence leaves split state.

### 5.3 Collect waste (citizen-as-collector pattern, à la pickup-coin apps)
- ❌ **Missing UI.** The `/collect` sidebar link 404s.
- 🟡 **Backend scaffold:** see §3.4.

### 5.4 Rewards
- ❌ **Missing UI.** The `/rewards` sidebar link 404s.
- 🟡 **Backend scaffold (with bugs):**
  - `getAvailableRewards(userId)` (`actions.ts:367`) computes the user's points by summing `getRewardTransactions` — which is **`LIMIT 10`** (`actions.ts:348`). 🔴 Users with more than 10 transactions will see the wrong balance.
  - `getUserBalance(userId)` (`actions.ts:485`) has the same bug for the same reason.
  - `redeemReward(userId, 0)` (`actions.ts:436`) zeroes the `Rewards.points` column but does not zero the `Transactions` ledger, producing two inconsistent balances afterwards.
  - `saveReward(userId, amount)` (`actions.ts:251`) **inserts a new `Rewards` row each time** instead of updating the user's single row — duplicating per-user reward records.

### 5.5 Leaderboard
- ❌ **Missing UI.** The `/leaderboard` sidebar link 404s.
- 🟡 **Backend scaffold:** `getAllRewards()` (`actions.ts:313`) joins Rewards × Users ordered by points — but because of §5.4's duplication bug, ranking is meaningless until the schema is fixed.

### 5.6 Notifications
- 🟡 **Working in part.**
  - `getUnreadNotifications(userId)` + bell icon + dropdown (`Header.tsx:128–142`) ✅
  - Polled every 30 s — heavy; no WebSocket / SSE.
  - `markNotificationAsRead` fires on click, but the dropdown doesn't optimistically remove the item — stale UI until next poll.

### 5.7 Profile / Settings
- ❌ **Missing UI.** Both header user menu items ("Profile", "Settings") link to `/settings` which 404s.

---

## 6. Cross-Cutting Flows

### 6.1 Search
- 🟡 **Cosmetic only.** Search input renders (`Header.tsx:255–264`) but is not wired to any handler. No `/api/search`, no global index.

### 6.2 Onboarding / Empty states
- ❌ **Missing.** No first-time tour, no empty-state illustrations, no "Get started" CTA.

### 6.3 Error handling / boundaries
- ❌ **Missing.** No `error.tsx`, no `not-found.tsx`, no `global-error.tsx` files anywhere in `app/`. All errors swallowed in `try/catch` with `console.error`.

### 6.4 Loading states
- 🟡 **Minimal.** One literal `"Loading web3Auth ........"` string (`Header.tsx:236`). No `loading.tsx` route files, no skeletons.

### 6.5 Logout
- ✅ **Working.** `logout()` in `Header.tsx:200` calls `web3Auth.logout()` and clears `localStorage.email`.

---

## 7. Per-flow Matrix Summary

| # | Flow | Persona | Status | Blocker |
|---|------|---------|--------|---------|
| F-01 | Login (any user) | All | 🟡 | No server session; localStorage as identity |
| F-02 | Logout | All | ✅ | — |
| F-03 | View notifications | All | ✅ | Polling cost; no optimistic update |
| F-04 | Mark notification read | All | 🟡 | UI does not update until next poll |
| F-05 | View balance | All | 🟡 | `LIMIT 10` bug in `getUserBalance` |
| F-06 | Global search | All | ❌ | No backend, no index |
| F-07 | Submit waste report | Citizen | ❌ | No `/report` page |
| F-08 | Upload report photo | Citizen | ❌ | No object storage integration |
| F-09 | AI-classify uploaded photo | System | ❌ | No AI integration |
| F-10 | Browse pending reports | Operator | ❌ | No `/collect` page |
| F-11 | Accept assignment | Operator | ❌ | No assignment table or UI |
| F-12 | Submit pickup proof | Operator | ❌ | No UI; backend has overlapping functions |
| F-13 | Earn points for report | Citizen | 🟡 | Non-transactional; partial failures possible |
| F-14 | Earn points for pickup | Operator | 🟡 | `saveReward` creates duplicate rows |
| F-15 | Browse rewards | Citizen | ❌ | No `/rewards` page |
| F-16 | Redeem reward | Citizen | 🟡 | Ledger desync after redeem |
| F-17 | View leaderboard | Any | ❌ | No `/leaderboard` page; bad source data |
| F-18 | View profile | Any | ❌ | No `/settings` page |
| F-19 | Edit profile | Any | ❌ | No update function in `actions.ts` |
| F-20 | Admin dashboard | Admin | ❌ | No role, no page |
| F-21 | Manage users | Admin | ❌ | No CRUD endpoints |
| F-22 | Manage vehicles | Admin | ❌ | No table, no UI |
| F-23 | Manage routes | Admin | ❌ | No table, no UI |
| F-24 | Assign route to operator | Supervisor | ❌ | No table, no UI |
| F-25 | Live GPS tracking | Supervisor | ❌ | No table, no map |
| F-26 | Generate compliance report | Admin | ❌ | No exporter, no reporting layer |
| F-27 | Analytics dashboards | Admin | ❌ | No charts, no analytics tables |
| F-28 | File incident | Operator | ❌ | No incidents table |
| F-29 | Resolve incident | Supervisor | ❌ | No incident workflow |
| F-30 | Weighbridge / dispatch | Dump-site | ❌ | No table, no UI |
| F-31 | View audit log | Admin | ❌ | No audit log |

**Score:** 2 ✅ / 7 🟡 / 22 ❌ across 31 enumerated flows.

---

## 8. Implications for the Roadmap

- **Most user-facing pages are unwritten.** Building them out is the dominant scope.
- **The schema must be corrected and extended before role-based screens are built** (roles, routes, vehicles, incidents).
- **Auth must move server-side before any data-mutating screen ships.** Otherwise every screen built between now and then will need a security re-spin.
- **Reward subsystem has correctness bugs that mislead any leaderboard / balance UI** — fix the ledger before exposing it.

These four observations drive the ordering in `MASTER_DELIVERY_ROADMAP.md`.

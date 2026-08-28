# PROJECT DISCOVERY REPORT
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18
**Audited branch:** `dev`
**Auditor role:** Principal Software Architect / Sr. PM / Sr. QA / Sr. DevOps / Tech Lead

---

## 1. Project Purpose

### 1.1 Stated mission
> "A robust solution designed to streamline waste collection, tracking, monitoring, reporting and disposal processes. The platform leverages AI and intelligent automation to improve operational efficiency, transparency, accountability, planning and decision-making across waste management operations."

The system is named after **Kiteezi**, the historically problematic landfill site outside Kampala, Uganda (the largest municipal waste disposal site in the country, known for landslide incidents and capacity issues). The product description (`app/metadata.tsx`) confirms: *"This is an AI waste management system for Kiteezi, Uganda"*.

### 1.2 Problem space (inferred)
- Informal waste pickup with poor tracking and no accountability.
- Lack of real-time visibility into collection vs. dump-site activity.
- No data pipeline for planning, route optimisation, or compliance reporting.
- Limited citizen channels to report uncollected / illegally dumped waste.

### 1.3 Intended users (inferred from sidebar + schema)
| Role | Evidence in repo | Status |
|------|------------------|--------|
| Citizen / Reporter | `/report` route, `Reports` table, "earned_report" transaction | Route declared in Sidebar; **page not built** |
| Collector / Field Operator | `/collect` route, `CollectedWastes` table, `collector_id` FK | Route declared; **page not built** |
| Administrator / Supervisor | implied by "monitoring, reporting, AI tools" in brief | **No evidence in code**; no admin pages, no role column |
| Reward redeemer / general user | `/rewards`, `/leaderboard`, `Rewards`/`Transactions` tables | Routes declared; **pages not built** |

> ⚠️ The current data model has **no `role` column** on `Users`. The application is effectively single-role.

### 1.4 Business value (intended)
- Improved collection coverage and verifiable disposal.
- Token / points incentive to encourage citizen reports and verified pickups.
- AI-assisted waste image verification (suggested by `verificationResult jsonb` column, not yet implemented).
- Compliance-grade audit trail (`Transactions` table records earned/redeemed events).

---

## 2. Tech Stack

| Layer | Choice | Version | Notes |
|-------|--------|---------|-------|
| Framework | Next.js (App Router) | 15.5.6 | Turbopack dev enabled |
| UI | React | 19.2.0 | Bleeding edge — `@types/react` still at 18 (mismatch) |
| Styling | TailwindCSS + shadcn/ui (new-york) | 3.4.1 | Only 3 primitives generated: `button`, `badge`, `dropdown-menu` |
| Icons | lucide-react | 0.464 | |
| ORM | Drizzle | 0.36.4 + drizzle-kit 0.29 | `db:push` only — **no migration files** |
| Database | Neon Postgres (HTTP) | `@neondatabase/serverless` 0.10.4 | Serverless HTTP driver |
| Auth | Web3Auth Modal | 9.4.5 | Wraps EVM (Ethereum Sepolia testnet) wallet — **client-side only** |
| Notifications | react-hot-toast | 2.4.1 | Installed but **not used** anywhere |
| Lint | eslint-config-next | 8 | No custom rules |
| Tests | — | — | **No test framework installed** |
| CI/CD | — | — | **No `.github/workflows`, no Dockerfile, no Vercel config** |

### 2.1 Notable absences (not present in `package.json`)
- No map library (Mapbox / Leaflet / Google Maps) — yet the product is "tracking & routes".
- No AI SDK (Gemini, OpenAI, Anthropic, TensorFlow.js) — yet the product is "AI waste verification".
- No image upload library (UploadThing / S3 / Cloudinary) — yet `Reports.imageUrl` is a column.
- No form library (react-hook-form / Zod) — required for any non-trivial input flow.
- No state management beyond local `useState` — no Zustand / TanStack Query / Redux.
- No charting library — yet the product is "reporting & analytics".
- No date library (date-fns / dayjs) — date formatting is done with raw `toISOString().split('T')[0]`.

---

## 3. Repository Layout

```
kiteezi-waste-management/
├─ app/
│  ├─ layout.tsx          ← "use client" RootLayout (anti-pattern — kills SSR)
│  ├─ page.tsx            ← Empty home (all content commented out)
│  ├─ metadata.tsx        ← Stranded — layout is client, metadata never read
│  ├─ globals.css         ← shadcn default tokens
│  └─ fonts/              ← GeistVF + GeistMonoVF (imported but Inter is used in layout)
├─ components/
│  ├─ Header.tsx          ← Web3Auth login, balance, notifications (340 lines)
│  ├─ Sidebar.tsx         ← 5 nav items + settings (links lead nowhere)
│  └─ ui/
│     ├─ button.tsx
│     ├─ badge.tsx
│     └─ dropdown-menu.tsx
├─ hooks/
│  └─ useMediaQuery.tsx   ← uses deprecated MediaQueryList.addListener
├─ lib/
│  └─ utils.ts            ← cn() helper
├─ utils/
│  └─ db/
│     ├─ dbConfig.jsx     ← Drizzle + Neon serverless setup (.jsx but no JSX)
│     ├─ schema.ts        ← 6 tables, no indexes, no enums
│     └─ actions.ts       ← 25 async functions, "use server" NOT declared
├─ .env                   ← ⚠️ COMMITTED TO REPO (not in .gitignore)
├─ .env.example
├─ drizzle.config.js      ← outputs to ./drizzle but folder doesn't exist
├─ next.config.mjs        ← re-exports env vars (anti-pattern)
├─ tailwind.config.ts
├─ tsconfig.json
└─ package.json
```

### 3.1 Files of concern (full audit notes in TECHNICAL_AUDIT.md)
- `.env` is tracked (only `.env*.local` is in `.gitignore`)
- `utils/db/actions.ts` is shared between client and server with no `"use server"` directive
- `app/layout.tsx` is a client component — defeats Server Components for the whole tree
- `next.config.mjs` re-exposes `DATABASE_URL` to the client via `env: {}` — **critical security defect** (see §6.1 of Technical Audit)
- `dbConfig.jsx` uses `.jsx` extension but contains no JSX

---

## 4. Domain Model (as-built)

### 4.1 Tables (`utils/db/schema.ts`)

```
Users (id PK, name, email UNIQUE, created_at)
Reports (id PK, user_id FK→Users, location text, wasteType, amount,
         imageUrl, verificationResult jsonb, status default 'pending',
         created_at, collector_id FK→Users nullable)
Rewards (id PK, user_id FK→Users, points int default 0,
         createdAt, updatedAt, isAvailable bool, description,
         name, collectionInfor)
CollectedWastes (id PK, reportId FK→Reports, collectorId FK→Users,
                 collectionDate, status default 'collected')
Notifications (id PK, userId FK→Users, message, type varchar(50),
               isRead default false, createdAt)
Transactions (id PK, userId FK→Users, amount int, type varchar(20),
              description, date)
```

### 4.2 Missing tables (required by the brief)
| Domain | Required tables (not present) |
|--------|-------------------------------|
| Roles & permissions | `roles`, `user_roles`, `permissions` |
| Routes | `routes`, `route_stops`, `route_assignments` |
| Vehicles | `vehicles`, `vehicle_drivers`, `maintenance_logs` |
| Tracking | `gps_pings`, `route_events`, `collection_checkins` |
| Incidents | `incidents`, `incident_evidence`, `incident_status_history` |
| Disposal | `dump_site_dispatches`, `weighbridge_records` |
| Audit | `audit_log`, `entity_history` |
| Files | `attachments` (currently `imageUrl` is just a string column) |
| Districts / zones | `zones`, `wards`, `households` |
| AI runs | `ai_classification_runs`, `model_versions` |

### 4.3 Schema defects
1. `Users` lacks `role`, `phone`, `is_active`, `last_login_at`.
2. `Reports.amount` is `varchar(255)` — should be numeric with a unit column.
3. `Reports.wasteType` is `varchar(255)` — should be an enum or FK to a categories table.
4. `Reports.status` is free-text — should be a Postgres enum.
5. `Rewards` is **mis-modelled**: there is no unique constraint on `user_id`, but `getOrCreateReward` assumes one row per user. `saveReward` inserts a brand-new row per collection event — creating duplicate user-rewards. The "points" column is therefore both **per-user balance** and **per-event amount** depending on which function wrote it. → **Functional bug**.
6. No indexes other than primary keys. Queries on `Reports.user_id`, `Reports.status`, `Notifications.userId`, `Transactions.userId` will all do sequential scans.
7. No `deleted_at` / soft-delete columns.
8. `verificationResult jsonb` has no schema or shape — no contract between writer and reader.
9. `Rewards.collectionInfor` is a typo (should be `collectionInfo`).
10. No FK `ON DELETE` actions specified — orphan risk.

---

## 5. Code Inventory

### 5.1 What exists
| File | Lines | Purpose | State |
|------|-------|---------|-------|
| `app/layout.tsx` | 39 | Root layout with Header + Sidebar | ⚠️ client-only, hardcoded sidebar state |
| `app/page.tsx` | 99 | Home page | ❌ entirely commented out |
| `app/metadata.tsx` | 7 | Static metadata | ⚠️ stranded (never imported by Server Component) |
| `components/Header.tsx` | 340 | Web3Auth login, balance, notifications | 🟡 partially working |
| `components/Sidebar.tsx` | 58 | Nav links | 🟡 links target nonexistent routes |
| `components/ui/*` | ~250 | shadcn primitives | ✅ standard |
| `utils/db/schema.ts` | 60 | Drizzle schema | 🟡 6 tables, defects above |
| `utils/db/actions.ts` | 491 | 25 DB functions | 🟡 server actions, lacks auth + validation |
| `utils/db/dbConfig.jsx` | 8 | DB client | 🟡 `.jsx` extension wrong |
| `hooks/useMediaQuery.tsx` | 20 | Responsive helper | 🟡 uses deprecated API |
| `lib/utils.ts` | 6 | `cn()` | ✅ |
| `tailwind.config.ts` | 63 | Tailwind | ✅ |
| `drizzle.config.js` | 10 | Drizzle config | ⚠️ no `dotenv` call → `DATABASE_URL` undefined at CLI time |
| `.env.example` | 13 | Env template | ✅ |
| `.env` | 9 | **TRACKED** prod-ish env | 🔴 **leaked** |
| `README.md` | 37 | Default CRA boilerplate | 🔴 useless |
| `next.config.mjs` | 9 | Re-exposes `DATABASE_URL` | 🔴 **critical** |

### 5.2 What does **not** exist
- `app/api/**` — no API routes.
- `app/(any-route)/page.tsx` other than home — `/report`, `/collect`, `/rewards`, `/leaderboard`, `/settings` all 404.
- `app/admin/**`, `app/operator/**`, `app/supervisor/**` — no role-scoped surfaces.
- `middleware.ts` — no auth gating, no logging, no rate limiting.
- `__tests__/`, `*.test.ts`, `*.spec.ts`, `e2e/`, `playwright.config.*`, `vitest.config.*`, `jest.config.*` — **zero tests**.
- `Dockerfile`, `docker-compose.yml` — no container strategy.
- `.github/workflows/` — no CI.
- `drizzle/` — no migrations on disk (the configured output directory).
- `docs/` (any pre-existing project docs) — this audit is the first.
- `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE`.
- `SECURITY.md`, threat model, ADRs.
- `.editorconfig`, `prettier.config.*`.

---

## 6. Branches and Recent Work

```
main             ← unknown (not local checkout)
dev              ← active integration branch (current)
feature/header-component   ← merged via PR #4
feature/side-bar           ← merged via PR #5
ft-header-design           ← merged via PRs #2 and #3
```

Last 5 merged work items (newest first):
1. `66b58e7` Sidebar component + Web3Auth init improvements
2. `3fa519d` Expand DB actions (rewards + waste management)
3. `bc59a25` TS config bump for Next 15
4. `638a267` Header refactor with Web3Auth
5. `7e210a3` Upgrade to Next.js 15.5.6 + Turbopack

**Pattern:** sequential, single-developer, small feature-branch workflow. No CI gates on the PRs.

---

## 7. Architecture (as-built)

### 7.1 Frontend
- **Pattern:** Next.js App Router, but `app/layout.tsx` is forced to `"use client"` — every page becomes a client component subtree. No RSC benefit, no streaming, no metadata.
- **State:** local `useState` only. Cross-component state (e.g. wallet, user, balance) is duplicated and re-fetched in each component that needs it.
- **Auth state:** Web3Auth singleton instantiated at module scope in `Header.tsx` — re-runs on every hot reload, leaks listeners.
- **Notifications:** polled every 30 s via `setInterval`.
- **Forms:** none yet.
- **Maps:** none.

### 7.2 Backend
- **No real backend.** All "backend" logic is in `utils/db/actions.ts`, which is imported directly from a `"use client"` component (`Header.tsx`) and calls Drizzle. Next.js will bundle this for the server side only when the file is treated as a Server Action, **but the file has no `"use server"` directive**.
- This means either:
  - the build fails to tree-shake DB code into the client bundle (correct outcome, but undefined behaviour), or
  - the DB code ends up on the client (catastrophic — `DATABASE_URL` is also re-exposed via `next.config.mjs`).

### 7.3 Database
- Neon HTTP driver — appropriate for serverless / edge.
- Schema is `db:push`-managed → **no migration history**, no ability to roll back, no review of DDL changes.

### 7.4 Auth
- Web3Auth Modal SDK on the client.
- After connect: email is read from Web3Auth user info, stored in `localStorage`, and `createUser(email, name)` is fired.
- There is **no server-side verification** of the wallet signature, no session token, no JWT, no cookie. Any caller can invoke server actions with any `userId`.

### 7.5 AI
- Nothing implemented. `Reports.verificationResult jsonb` is a placeholder for a future model.

### 7.6 Infrastructure
- No declared deployment. Implied target: Vercel (default `next start`, no Dockerfile).
- No environments: only one `.env`. No staging/production separation.
- Secrets: managed via `.env` checked into git.

---

## 8. Architecture Diagrams (current state)

### 8.1 Component / runtime
```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (Next.js client bundle, "use client" root)              │
│   ┌────────────┐   ┌──────────────────────────┐                 │
│   │ Sidebar    │   │ Header                   │                 │
│   │ (5 dead    │   │   Web3Auth Modal SDK     │                 │
│   │  links)    │   │   ├─ login/logout        │                 │
│   └────────────┘   │   ├─ balance polling     │                 │
│                    │   └─ notifications 30s   │                 │
│                    └────────┬─────────────────┘                 │
│                             │ direct import                     │
│                             ▼                                   │
│        utils/db/actions.ts (no "use server")                    │
│                             │                                   │
└─────────────────────────────┼───────────────────────────────────┘
                              │ Drizzle ORM
                              ▼
                  ┌──────────────────────┐
                  │ Neon Postgres (HTTP) │
                  └──────────────────────┘

⚠️  No middleware, no API route, no session, no auth gate.
⚠️  Sidebar links 404 except "/".
⚠️  AI box does not exist.
⚠️  Map / GPS box does not exist.
```

### 8.2 Target architecture (for reference — see Roadmap)
```
Browser ──► Next.js Edge middleware (authN + rate limit)
             │
             ├─► RSC pages (admin / operator / citizen surfaces)
             ├─► Server actions ("use server") — validated with Zod
             └─► Route Handlers /api/* for webhooks + integrations
                       │
                       ├─► Drizzle → Neon Postgres (migrations)
                       ├─► Object store (R2 / S3) for images
                       ├─► AI service (Gemini / OpenAI) for waste classification
                       ├─► Map provider (Mapbox) for routes + GPS
                       └─► Observability (Sentry + OpenTelemetry → Grafana)
```

---

## 9. Discovery Conclusions

1. **The repo is a scaffold, not a product.** It contains a header, sidebar, DB schema and ~25 helper functions. Every advertised capability (AI, tracking, routes, vehicles, admin, reports, analytics) is unbuilt.
2. **The few built parts have correctness bugs** (`Rewards` table is misused as both balance and event log; balance ignores transactions beyond the first 10; rewards row duplication).
3. **There are critical security defects**: `.env` committed; `DATABASE_URL` re-exposed to the client via `next.config.mjs`; no session, no RBAC, no auth gate on DB writes.
4. **There is no CI, no tests, no migrations, no Dockerfile, no observability.** Production deploy at this stage would be unsafe.
5. **Documentation is absent.** The README is the unaltered Create-Next-App boilerplate.

A new engineering team taking this over should treat the codebase as **a starting kit (~8–12 % complete)**, not a partially built product, and plan an end-to-end build along the Master Roadmap in this audit pack.

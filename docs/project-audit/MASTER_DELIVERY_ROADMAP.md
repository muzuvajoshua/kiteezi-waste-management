# MASTER DELIVERY ROADMAP
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18
**Horizon:** 14–18 weeks to defensible v1

> Each epic is sized in **engineer-weeks** (one engineer, one week, full-time) and marked with a risk band: 🟢 low · 🟡 medium · 🔴 high. Epics ordered to maximise unblocking; dependencies arrowed.

---

## Epic 1 — Core Platform Foundation
**Objective:** make the codebase a viable platform: trustworthy auth, correct schema, proper boundaries, real migrations.

**Deliverables**
- Server-side auth: Web3Auth ID-token verification on the server; signed HTTP-only session cookies; logout that invalidates server-side state.
- RBAC: `role` column + `roles` & `user_roles` tables; `requireRole()` server-action wrapper.
- `"use server"` discipline; remove `next.config.mjs` env re-exports; rotate leaked secrets and purge from git history.
- Convert `app/layout.tsx` back to a server component; move sidebar state into a client shell.
- Drizzle migration history (delete `db:push`, switch to `drizzle-kit generate` + commit migrations).
- Repair `Rewards` schema: unique on `user_id`, separate `reward_catalog` from `user_reward_balance`, add `idempotency_key` on transactions.
- Add indexes on every FK + `Reports.status`, `Notifications.userId+isRead`, `Transactions.userId+date`.
- Add `audit_log` table + helper.
- Replace `localStorage.email` identity with session-derived identity.
- Zod schemas at every server-action boundary.

**Dependencies:** none — this epic unblocks all others.
**Risk:** 🔴 (schema migration with running data; auth refactor)
**Effort:** ~6 engineer-weeks

---

## Epic 2 — Waste Collection Operations
**Objective:** the citizen-report + operator-collect loop works end-to-end.

**Deliverables**
- `/report` page: location picker (map), waste type (enum), amount, photo upload, AI verdict (stub if AI epic not yet ready).
- Signed-URL upload pipeline to R2 (or S3); `attachments` table.
- `/operator/today` page: list of pending reports near the operator, with map view.
- Operator check-in/check-out flow with geo-bounded confirmation and proof photo.
- `collection_checkins` table; transactional reward issuance using fixed `Rewards` model from Epic 1.
- Supervisor inbox: pending reports list with bulk approve / reject.
- E2E tests for the full loop (Playwright).

**Dependencies:** Epic 1
**Risk:** 🟡 (upload + map integration)
**Effort:** ~6 engineer-weeks

---

## Epic 3 — Tracking & Monitoring
**Objective:** real-time visibility into operations.

**Deliverables**
- `routes`, `route_stops`, `route_assignments`, `vehicles`, `vehicle_drivers`, `gps_pings` schemas.
- Operator PWA shell: background location ping when on shift (with explicit consent + privacy notice).
- Supervisor "Live Ops" map showing vehicles, route progress, incidents.
- `incidents` table + operator filing flow + supervisor resolution flow.
- SLA timers per route (configurable).
- Offline-first queue for check-ins / incidents (Service Worker + IndexedDB).

**Dependencies:** Epic 1, Epic 2
**Risk:** 🔴 (offline-first PWA + GPS + battery considerations)
**Effort:** ~7 engineer-weeks

---

## Epic 4 — AI Features
**Objective:** automate the boring parts of waste classification + abuse detection.

**Deliverables**
- Server route `POST /api/ai/classify-waste` calling Gemini Vision (or OpenAI) → `{category, confidence, hazards}`, cached.
- `ai_classification_runs` table; `model_versions` table.
- Verdict surfaced to citizen submission UI and to supervisor inbox (low-confidence flagged).
- Duplicate-report detector: pgvector embeddings + geo-bucket; nightly job.
- Fraud / free-mint heuristic: anomaly score on per-user submission rate; auto-throttle.
- Admin override UI: see verdicts, correct labels, retrain dataset export.

**Dependencies:** Epic 1, Epic 2 (uses upload pipeline)
**Risk:** 🟡 (provider cost + accuracy in local context)
**Effort:** ~5 engineer-weeks

---

## Epic 5 — Reporting & Analytics
**Objective:** decisions backed by data.

**Deliverables**
- KPI dashboards (admin + supervisor): tons collected, on-time %, redemption rate, top zones.
- Daily aggregation job populating `daily_metrics` (mat-view or worker).
- Export to CSV and PDF (Resend / Postmark scheduled emails).
- Audit log search UI for admins.
- Compliance report templates (monthly waste-collection summary).

**Dependencies:** Epic 1, Epic 2, Epic 3
**Risk:** 🟢
**Effort:** ~4 engineer-weeks

---

## Epic 6 — Security Hardening
**Objective:** lift to a defensible v1 security posture.

**Deliverables**
- Strict CSP, HSTS preload, COOP/COEP, Referrer-Policy via `middleware.ts`.
- Rate limiting (Upstash Ratelimit) on every mutating action.
- Turnstile / hCaptcha on anonymous report flow.
- File upload security: MIME sniff, size cap, optional virus scan.
- Dependency scanning: Dependabot + Snyk on PRs.
- External pen-test pre-launch.
- SECURITY.md, threat model, data classification, retention policy.

**Dependencies:** Epic 1
**Risk:** 🟡
**Effort:** ~3 engineer-weeks (+ external pen-test calendar time)

---

## Epic 7 — Testing & Quality
**Objective:** keep the bar from collapsing as scope grows.

**Deliverables**
- Vitest project with first ≥ 80 % coverage on `utils/db/actions.ts`.
- Drizzle integration tests against a per-PR Neon branch.
- Playwright E2E for 5 critical journeys (login, citizen report, operator collect, supervisor approve, redeem).
- axe-core a11y checks in Playwright.
- Lighthouse CI: perf ≥ 80, a11y ≥ 90 budget on PRs.
- Visual regression (Playwright snapshots).
- k6 load test in nightly CI.

**Dependencies:** Epic 1 (sets up CI), runs continuously alongside Epics 2–6.
**Risk:** 🟢
**Effort:** ~4 engineer-weeks

---

## Epic 8 — Infrastructure & Deployment
**Objective:** repeatable, reviewable deploys with safe rollback.

**Deliverables**
- GitHub Actions: lint + typecheck + unit + integration + build + Playwright on every PR.
- Vercel projects: `staging` (from `dev`) and `production` (from `main`); per-PR previews.
- Neon project: `dev` / `staging` / `prod` branches; PITR ≥ 14 days; documented restore drill.
- Secret manager (Vercel project envs or Doppler); document rotation procedure.
- `Dockerfile` for non-Vercel deploys.
- Observability: Sentry, OpenTelemetry → Grafana Cloud / Honeycomb, Better Uptime, Statuspage.
- Background jobs runtime (Inngest).
- Transactional email (Resend) for notifications & scheduled reports.
- Runbooks (SEV-1/2/3) + on-call rotation.

**Dependencies:** Epic 1
**Risk:** 🟡
**Effort:** ~4 engineer-weeks

---

## Epic 9 — Production Readiness
**Objective:** sign off the launch checklist (see PRODUCTION_READINESS_REPORT.md §4).

**Deliverables**
- All P0 GAP items closed.
- Pen-test report addressed.
- Accessibility audit passed.
- Load test passed at 10× target concurrency.
- DR drill performed.
- Privacy policy + ToS published.
- Pilot with 1 municipal partner; iterate on telemetry.

**Dependencies:** Epics 1–8
**Risk:** 🟡
**Effort:** ~3 engineer-weeks (gating activity, not building activity)

---

## 10. Scope-cut Options (if timeline pressure)

If we must ship faster, candidate cuts (in order of "least painful first"):
1. **Drop Epic 4 (AI) for v1** — collect data first, deploy classifier in v1.1. Saves ~5 weeks.
2. **Reduce Epic 3 to web-only operator console** (no PWA / GPS) — saves ~3 weeks; sacrifices live tracking.
3. **Defer Epic 5 analytics to v1.1** — keep raw CSV export only. Saves ~2 weeks.
4. **Cut admin UI**: ship admin-via-Drizzle-Studio + service runbook for v1. Saves ~2 weeks; brittle but functional.
5. **Cut leaderboard, multilingual, push notifications.** Saves ~1 week.

An aggressive "Minimum Defensible v1" = Epics 1 + 2 (cut to web only) + 6 + 7 (cut to unit + 1 E2E) + 8 (cut to single env + Sentry only) ≈ **8 engineer-weeks** for a 4-engineer team.

---

## 11. Sequencing Gantt (indicative)

```
Week:        1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
Epic 1 ████████████
Epic 2          ████████████
Epic 6                ██████
Epic 8                ████████
Epic 7                ████████████████████████████  (continuous)
Epic 3                            ██████████████
Epic 4                                  ██████████
Epic 5                                        ████████
Epic 9                                              ██████
```

---

## 12. Team Composition (recommended)

| Role | FTE | Justification |
|------|----:|---------------|
| Tech Lead / Full-stack senior | 1 | Owns architecture, code review |
| Frontend engineer | 2 | UI surfaces are the majority of scope |
| Backend engineer | 1 | Schema, server actions, integrations |
| ML / AI engineer | 0.5 | Epic 4 only; can be contractor |
| DevOps / SRE | 0.5 | CI/CD, observability, on-call setup |
| QA engineer | 0.5 | E2E, accessibility, load |
| Product manager | 0.5 | Roadmap, stakeholder ops |
| Designer (UX/UI) | 0.5 | Brand, design tokens, accessibility |
| **Total** | **6.5 FTE** | |

---

## 13. Key Risks (Roadmap-level)

| Risk | Mitigation |
|------|------------|
| Schema migration mid-product | Use Drizzle migrations + staging-first deploys; never destructive on prod |
| Field connectivity (rural Uganda) | Offline-first PWA + SMS fallback path in Epic 3/Epic 9 |
| AI provider cost overruns | Cache classifications; cap per-user / per-day budget; fallback to human review |
| Pen-test surprises | Schedule pen-test at end of Epic 6, not at the very end — buy time for fixes |
| Web3Auth lock-in | Keep an adapter abstraction; the rest of the system should see "session" only |
| Public Web3Auth network costs | Decide if SAPPHIRE_MAINNET is actually needed; the system works without on-chain anything if reward-points stay off-chain |

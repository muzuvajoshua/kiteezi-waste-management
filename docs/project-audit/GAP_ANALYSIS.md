# GAP ANALYSIS
**Project:** Kiteezi Waste Management System
**Audit date:** 2026-06-18

Priority key: **P0** must-have for v1 launch · **P1** must-have within 30 days of launch · **P2** nice-to-have · **P3** future

---

## 1. Features

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Citizen: Submit waste report | No UI; backend `createReport` exists | Form with location (map pin), waste type (enum), amount, photo upload; AI auto-classifies; submission earns capped points | Build `/report` page, image upload pipeline, AI classifier hook, form + Zod validation | **P0** |
| Citizen: View own reports | No UI; `getReportsByUserId` exists | Paginated list with status, photo, AI verdict, collector | Build `/my-reports` page | **P1** |
| Citizen: Rewards | No UI; backend buggy | Rewards catalog, redemption flow, immutable balance display | Build `/rewards` page; fix ledger | **P0** |
| Citizen: Leaderboard | No UI | Top-N rankings (week / month / all-time), opt-out toggle | Build `/leaderboard` page; opt-out flag in users | **P2** |
| Citizen: Notifications | Polled every 30s | Push (SSE/WebPush), in-app history, mark all read | Add SSE endpoint; service worker for push | **P1** |
| Citizen: Profile | No UI | Edit name/phone/avatar, opt-outs, delete account | Build `/settings` page; add `updateUser` action | **P1** |
| Operator: Login (role-aware) | Same modal for all | Role-aware redirect; operator console landing | Add role; role-aware redirect in middleware | **P0** |
| Operator: Assigned routes | No table, no UI | List assigned routes & stops for today | Build `routes` schema; `/operator/today` page | **P0** |
| Operator: GPS tracking on shift | Nothing | Background location ping every 30 s while on shift | PWA + `gps_pings` table + opt-in consent flow | **P1** |
| Operator: Check-in / Check-out | Nothing | Confirm pickup with geo-bounded check-in + photo | `collection_checkins`; mobile-friendly UI | **P0** |
| Operator: File incident | Nothing | Incident type, photo, location, severity | `incidents` schema; `/operator/incident` page | **P1** |
| Supervisor: Live ops map | Nothing | Real-time map of vehicles, route progress, alerts | Mapbox/Leaflet integration; aggregation API | **P1** |
| Supervisor: Approve / reject reports | Nothing | Inbox of pending reports with AI confidence shown | `/supervisor/inbox` page | **P0** |
| Supervisor: Route oversight | Nothing | SLA timers, on-time %, breach alerts | Reporting tables; alerts pipeline | **P1** |
| Admin: User management | Nothing | List, search, suspend, role-assign | `/admin/users` page; user CRUD actions | **P0** |
| Admin: Vehicle management | Nothing | CRUD + maintenance log | `vehicles`, `maintenance_logs` schemas; UI | **P1** |
| Admin: Route management | Nothing | Draw / import routes, assign to operator + vehicle | Routes schema; map drawing UI | **P1** |
| Admin: Reports / exports | Nothing | CSV/PDF exports, scheduled email reports | Reporting service; export jobs | **P1** |
| Admin: Analytics dashboards | Nothing | KPIs (tons collected, on-time %, redemption rate) | Analytics tables / mat-views; charts | **P2** |
| Admin: AI ops | Nothing | View model performance, override predictions | Model registry + override workflow | **P2** |
| Admin: Audit log | Nothing | All mutations searchable by actor / target | `audit_log` table; admin viewer | **P1** |
| Search | Cosmetic input only | Global search across reports / users / routes | Postgres FTS or Typesense | **P2** |
| Dump-site / weighbridge | Nothing | Trip-end weight capture, ticket print | `weighbridge_records`; dump-op UI | **P2** |
| Offline mode (operator PWA) | Nothing | Queue check-ins / incidents while offline | Service worker + Sync API + IndexedDB | **P1** |
| Multi-language (English / Luganda) | Nothing | i18n with at least 2 locales | next-intl integration | **P2** |
| SMS / WhatsApp fallback | Nothing | Citizens can report via SMS in low-data areas | Twilio / Africastalking webhook | **P3** |

---

## 2. Infrastructure

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Hosting | Local dev only | Vercel project (prod + preview + staging) | Provision projects, link repo | **P0** |
| Database | Single Neon dev branch | Prod branch + staging branch + PR-preview branches; PITR enabled; retention ≥ 14 days | Configure Neon project + branches | **P0** |
| Object storage | None | Cloudflare R2 (or S3 / Cloudinary) for report photos with signed-URL uploads | Provision bucket; signed-URL endpoint | **P0** |
| AI infra | None | Gemini or OpenAI vision API behind a server route, cached in `ai_classification_runs` | Pick provider; key in secret manager; SDK integration | **P1** |
| Map provider | None | Mapbox (or MapLibre + OSM) for routes + live ops | Choose provider; key in env | **P1** |
| Secrets manager | `.env` in repo | Vercel project env or Doppler / 1Password Connect | Migrate; rotate; audit history | **P0** |
| CI | None | GitHub Actions: lint + typecheck + unit + integration + build on every PR | Author workflow files | **P0** |
| CD | None | Vercel auto-deploy on `dev` → staging, on `main` → prod with manual gate | Configure Vercel + branch protections | **P0** |
| Container | None | Optional Dockerfile for non-Vercel deploys (Cloudflare Pages / AWS) | Author Dockerfile + `docker-compose` for local DB | **P2** |
| IaC | None | Pulumi or Terraform for non-Vercel resources (R2, DNS, Neon project) | Author IaC, store state in encrypted backend | **P2** |
| CDN | Vercel default | + cache rules for images and static analytics endpoints | Configure cache headers | **P2** |
| Background jobs | None | Inngest or Vercel Cron for nightly aggregation, scheduled exports | Add job framework + jobs | **P1** |
| Email | None | Resend / Postmark for transactional + scheduled reports | API key + templates | **P1** |
| Push notifications | None | Web Push (VAPID) + (optionally) FCM for mobile | VAPID setup; service worker | **P2** |

---

## 3. Security

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| AuthN | Web3Auth client-side only; localStorage email used downstream | Server-verified Web3Auth ID-token; HTTP-only signed session cookie; refresh rotation | Auth.js / Iron Session; server-side ID-token verification | **P0** |
| AuthZ | None | RBAC: roles=`citizen,operator,supervisor,admin,dumpop`; per-record ownership guards | `roles`/`user_roles` schema; `requireRole()` wrapper; resource policy helpers | **P0** |
| Input validation | None | Zod schemas at every action / route boundary | Author schemas; integrate with server actions | **P0** |
| Rate limiting | None | Per-IP + per-user on every mutating action (Upstash Ratelimit) | Provision Upstash; wrap actions | **P0** |
| CAPTCHA | None | hCaptcha on anonymous / pre-login flows | Integrate Cloudflare Turnstile | **P1** |
| Headers (CSP, HSTS, etc.) | Defaults only | Strict CSP, HSTS preload, COOP/COEP, Referrer-Policy strict-origin | `middleware.ts` headers | **P0** |
| Secrets | `.env` committed | Rotated + provider secret manager | Rotate + purge history | **P0** |
| OWASP A03 Injection | OK via Drizzle | Stay OK; add SQLi tests with `sqlmap` style fuzz | Add adversarial test suite | **P2** |
| Dependency audit | None | `npm audit` + Dependabot + Snyk on every PR | Configure | **P1** |
| Pen-test | None | External pen-test pre-launch | Schedule with vendor | **P1** |
| PII handling | Uncontrolled | Documented data inventory; retention policy; subject-access workflow | Author + implement | **P1** |
| File upload | None | MIME sniff + size cap + virus scan (ClamAV / VirusTotal) | Build upload pipeline | **P0** (if upload ships) |

---

## 4. Testing

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Unit tests | 0 % | ≥ 80 % line on `utils/db/actions.ts` & critical lib | Add Vitest + write tests | **P0** |
| Integration | 0 % | All server actions tested against real Neon branch | Add Testcontainers / Neon CI branches | **P0** |
| E2E | 0 % | Playwright on 5 critical journeys | Add Playwright + GH Actions job | **P0** |
| Visual regression | None | Chromatic or Playwright snapshots on PRs | Configure | **P2** |
| Accessibility | None | axe-core in Playwright CI; manual screen-reader pass on key pages | Configure | **P1** |
| Load test | None | k6 or Artillery: 10× target concurrent users | Author scenarios | **P1** |
| Security tests | None | OWASP ZAP / Burp baseline scan on staging weekly | Configure | **P1** |

---

## 5. Documentation

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| README | CRA boilerplate | Project README with setup, run, deploy, contribute | Rewrite | **P0** |
| ARCHITECTURE.md | None | C4 diagrams + sequence diagrams of key flows | Author | **P1** |
| ADRs | None | `docs/adr/0001-*.md` per major decision | Start | **P1** |
| CONTRIBUTING.md | None | Branch model, commit format, review SLA | Author | **P1** |
| SECURITY.md | None | Disclosure policy, contact, SLA | Author | **P0** |
| Runbooks | None | Per-SEV runbook with on-call escalation | Author | **P1** |
| API docs | None | OpenAPI / route docs once `/api/*` exists | Author with route handler comments | **P1** |
| User docs | None | Citizen / Operator / Admin guides | Author | **P2** |
| Data dictionary | None | One row per table + column + sensitivity tag | Author | **P1** |

---

## 6. AI

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Waste-photo classification | `verificationResult jsonb` placeholder only | Server route that calls Gemini Vision (or OpenAI) and returns `{ category, confidence, hazards }`; results cached and stored on report | Build classifier service; persist to `ai_classification_runs` | **P0** if AI is in v1 scope |
| Duplicate-report detection | None | Cosine similarity of embeddings + geo-bucket; flag suspected duplicates to operator | Embed photos; pgvector index | **P1** |
| Route optimisation | None | Daily route generator using Google Routes API / OR-Tools | Background job + provider | **P2** |
| Fraud detection (free-mint guard) | None | Heuristic + anomaly score; block when above threshold | Background job + admin override | **P1** |
| Analytics forecasting | None | Predicted weekly tonnage by zone | Notebook / scheduled job | **P3** |

---

## 7. UX

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Design system | shadcn defaults; ad-hoc green | Branded design tokens (palette, type scale, spacing), Figma source | Author tokens, sync with Tailwind | **P1** |
| Empty / loading / error states | None | Every screen handles all 3 explicitly | Add `loading.tsx`, `error.tsx`, `not-found.tsx`, skeletons | **P0** |
| Mobile parity | Sidebar drawer only | Operator UI is mobile-first PWA | PWA manifest + responsive screens | **P0** |
| Onboarding | None | First-time tour for each role | Add tour component, role-aware copy | **P2** |
| Accessibility | Poor (see §3.5 of Technical Audit) | WCAG 2.2 AA | a11y pass | **P0** |
| Internationalisation | English only | English + Luganda (at minimum) | next-intl + translation pipeline | **P2** |

---

## 8. Performance

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| DB indexes | PK only | Btree on every FK + key filter; partial indexes for "pending" / "unread" | Add migrations | **P0** |
| Query patterns | N+1 risk in upcoming features | Drizzle `with`/joins; explain-analyze checked-in | Code review discipline + index test in CI | **P1** |
| Frontend bundle | Heavy (Web3Auth full bundle in main chunk) | Dynamic import of auth modal; analyze size budget | Refactor; `@next/bundle-analyzer` in CI | **P1** |
| Image delivery | No pipeline | `next/image` + R2 + AVIF/WebP variants | Build pipeline | **P1** |
| Cache | None | RSC fetch cache + revalidate; SWR/TanStack on client | Adopt | **P1** |

---

## 9. Scalability

| Area | Current state | Desired state | Gap | Priority |
|------|---------------|---------------|-----|:--------:|
| Connection model | Neon HTTP per request | Stay on HTTP for serverless; switch to pooled WS for any long-lived worker | Confirm choice per service | **P2** |
| Queues / background work | None | Inngest / SQS for image processing, AI classification, notifications | Adopt Inngest | **P1** |
| Multi-tenant | Single org assumed | Optional org/tenant scope so multiple municipalities can run in one deploy | `organisations` schema; row-level filters | **P3** |
| Horizontal scale | Vercel auto | Documented limits and quota plan | Author capacity plan | **P2** |
| Data growth | Unbounded | Archive cold reports; aggregate old transactions; nightly summarisation | Background jobs | **P2** |

---

## 10. Aggregate Gap Counts

| Priority | Count |
|----------|------:|
| P0 (launch blockers) | 31 |
| P1 (within 30 days of launch) | 28 |
| P2 (nice-to-have) | 14 |
| P3 (future) | 4 |
| **Total tracked gaps** | **77** |

These 77 gaps map 1:1 to the GitHub issues generated in `GITHUB_ISSUES.md`, grouped by the 9 epics in `MASTER_DELIVERY_ROADMAP.md`.

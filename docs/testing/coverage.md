# Test coverage

**Config:** [`vitest.config.ts`](../../vitest.config.ts)
**Command:** `npm run test:coverage`
**Enforced:** on every PR, by the `Test (coverage thresholds enforced)` step in CI

---

## 1. Why this document exists

Until 2026-08-25 the coverage config still pointed at `lib/**` and `utils/db/**`
— paths that stopped existing when Phase 0 moved the codebase under `src/`. The
globs matched **2 files and 68 statements** and reported a healthy-looking
**"66%"**, while ignoring every one of the ~110 files under `src/modules`.

The number was not merely stale, it was misleading in the confident direction:
high enough to reassure, measured over almost nothing. This file records what is
now measured, what is deliberately not, and the baseline the thresholds are
anchored to, so the figure can be trusted or challenged on the evidence.

---

## 2. Current measurement — 2026-09-02

705 tests, 90 files, after **KWM-063** covered the Drizzle adapters.

| Metric | 2026-08-25 | 2026-09-02 |
|---|---|---|
| Statements | 70.00% (497/710) | **86.92%** (971/1117) |
| Branches | 62.82% (169/269) | **85.06%** (376/442) |
| Functions | 67.38% (157/233) | **87.97%** (322/366) |
| Lines | 69.46% (464/668) | **86.51%** (898/1038) |

Per layer:

| Layer | Statements | Reading |
|---|---|---|
| Domain | **97.4%** (76/78) | Business rules. Effectively complete. |
| Application — use-cases | **88.4%** (229/259) | Gaps are mostly `catch` arms. |
| Infrastructure — Drizzle adapters | **97.5%** (115/118) | Was 12.7%. See below. |
| Infrastructure — in-memory fakes | **98.3%** (228/232) | Exercised by every use-case test. |
| Presentation — actions, routes, schemas | **74.1%** (163/220) | Actions covered for authorization, rate limiting and auditing; the API route handlers still are not covered at all. |

The Drizzle row is the whole of the change. Those files went from 12.7% to
97.5% because every adapter now takes its database connection as a constructor
argument instead of importing a module-scope `db`, which is what made a second
contract run possible at all. The runs happen against PGlite — real Postgres,
compiled to WebAssembly, migrated by the same ten SQL files that ran against
Neon.

Three defects surfaced in the first hour of those tests existing, none of which
any in-memory fake could have shown:

| Defect | Why it was invisible |
|---|---|
| Redeeming a reward could **never succeed**, at any balance. The balance upsert put the signed amount in the INSERT's `VALUES`, and Postgres validates `CHECK` constraints against the proposed insert tuple *before* resolving the conflict — so `points >= 0` rejected every redemption before the `DO UPDATE` arm that would have computed a valid balance was reached. | No fake models a `CHECK`. |
| `purgeExpired()` deleted **live** rate-limit counters, not just closed windows. `expires_at` is `timestamp without time zone` holding UTC, and `now()` is a `timestamptz`; comparing them converts `now()` into the session's timezone. Neon defaults to UTC, so it never showed in production — it appeared the first time the adapter ran against a database inheriting the machine's timezone. | No fake has a timezone. |
| `DrizzleUserRepository` returned `created_at`, a column `UserRecord` does not declare. TypeScript could not object: an over-wide row is still structurally assignable. | The fake returns exactly the declared shape. |

Two of the three are in the two most security- and money-sensitive paths in the
system, and both had passing use-case, action and authorization tests
throughout.

---

## 2a. Historical baseline — measured 2026-08-25

Kept for the record; this is what the numbers above are measured against.
259 tests, 52 files. Totals over the measured set:

| Metric | Coverage |
|---|---|
| Statements | **70.00%** (497/710) |
| Branches | **62.82%** (169/269) |
| Functions | **67.38%** (157/233) |
| Lines | **69.46%** (464/668) |

The aggregate is the least interesting view. Per architectural layer:

| Layer | Statements | Reading |
|---|---|---|
| Domain | **98.5%** (64/65) | Business rules. Effectively complete. |
| Infrastructure — in-memory fakes | **99.3%** (140/141) | Exercised by every use-case test. |
| Application — use-cases | **85.9%** (128/149) | Strong. Gaps are mostly `catch` arms. |
| Presentation — actions, routes, schemas | **61.5%** (107/174) | Actions are now covered for authorization; the API route handlers are not covered at all. |
| `utils/db` | **57.0%** (45/79) | `schema.ts` is largely declarations; `audit.ts` is dead code (report §5.5); `dbConfig.ts`/`txClient.ts` are client construction. |
| Infrastructure — Drizzle adapters | **12.7%** (13/102) | **The honest headline.** No test executes SQL. |

That last row was the point of the exercise. Every repository had a contract
test suite, and every suite ran against the in-memory fake only — each file said
so in its own header. The 12.7% was the number that said "the real persistence
layer is unverified", and it is why the adapters were **not** excluded from
measurement: hiding them would have raised the aggregate by roughly 10 points
and erased the most important thing the report could tell you.

Closed by **KWM-063** on 2026-09-02 — see §2 for what it found.

---

## 3. What is measured

`src/**/*.{ts,tsx}`, minus the exclusions below.

| Excluded | Why | Removed when |
|---|---|---|
| `**/*.test.ts`, `**/*.test-support.ts`, `**/*.d.ts` | Test code is not the subject of measurement. | never |
| `src/app/**` | Next.js wiring, not logic: `layout`/`page`/`metadata`, plus one-line `export { POST } from '@/modules/…'` route shims. The real handlers live in `src/modules/*/presentation/*.route.ts` and **are** measured. Also holds fonts, favicon and CSS, which must never be instrumented. | never |
| `src/components/**`, `src/hooks/**` | React components and hooks need a jsdom environment and component tests; neither exists. The suite runs in `environment: 'node'`, so these files **cannot** be executed at all — counting them would pin a permanent 0% to the totals without adding actionable signal. | when component tests land (**KWM-062** / **KWM-064**) — delete the two lines, do not raise the floors to compensate |

Only the third row is a judgement call, and it is the one to argue with. The
justification is that these files are currently *unexecutable*, not merely
untested. That the UI has no tests is recorded plainly in the current-state
report §7 rather than smuggled into a percentage.

---

## 4. Thresholds

Floors, not targets. Each sits a couple of points below its measurement: enough
slack for ordinary churn, not enough to absorb a deleted test file.

| Scope | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Global | 84 | 82 | 85 | 84 |
| `src/modules/*/domain/**` | 95 | 95 | 95 | 95 |
| `src/modules/*/application/**` | 86 | 85 | 95 | 86 |
| `src/**/infrastructure/**/drizzle-*.ts` | 95 | 90 | 90 | 95 |

The Drizzle floor is new in KWM-063 and is the one that matters most. Those
files sat at 0–13% for the life of the project; a regression there means the
contract runs against real Postgres stopped happening, which is precisely the
state the issue existed to leave behind.

A threshold whose glob matches nothing passes vacuously — the same
false-confidence failure as the stale `lib/**` globs this document opens with.
The new glob was verified by raising its floor to 100 and confirming CI fails
with `Coverage for statements (97.45%) does not meet … threshold (100%)`.

The global floor is coarse on purpose, and the per-layer floors exist because of
a measured shortcoming rather than a hunch. Verified by deleting real test files
and observing whether CI would have failed:

| Deleted | Global floor | Per-layer floor |
|---|---|---|
| `report.actions.auth.test.ts` (37 tests) | **trips all four** | — |
| `reward-ledger.test.ts` (domain invariants) | passes — 70.00 → 69.71 | **trips `domain` lines** |
| `create-report.usecase.test.ts` | trips 2 | **trips all four `application`** |

The middle row is the reason the per-layer floors are there: a global threshold
over 710 statements cannot feel one small file leaving. Aiming precise floors at
the two layers that hold the business rules covers that gap without setting a
global number so tight it fails on unrelated churn.

**Raise these as coverage improves. Never lower one to make a red build pass** —
that converts the ratchet back into decoration. If a legitimate change lowers a
layer's coverage (deleting a well-tested module, say), re-measure and say so in
the commit message.

---

## 5. Reading the report

```bash
npm run test:coverage
```

Prints a per-file table and writes `coverage/coverage-summary.json`
(gitignored). Files with no test at all are included — that is Vitest 4's
default once `include` is set, and it is load-bearing here: it is what kept the
untested Drizzle adapters in the denominator until KWM-063 covered them, and
what will keep the next untested file visible.

Two cautions when interpreting a file-level number:

- **A green contract run against PGlite is not a green run against Neon.**
  PGlite is genuine Postgres, so constraints, enums, transactions and SQL
  semantics are real — that is what found all three defects in §2. What it is
  not is a deployment: no connection pooler, no cold starts, no network, and
  it is a single connection, so lock contention and the concurrent-insert races
  the adapters guard against cannot be reproduced. The files that reach those
  branches say so in their own headers rather than leaving the gap implied.
- **A covered line is not a tested behaviour.** The action files sat at ~75%
  statements *before* any authorization test existed, because use-case tests
  imported them incidentally. Coverage told us those lines executed; it could
  not tell us no assertion protected the guards. That gap was found by reading
  the code, and closed by mutation-testing each guard by hand. Treat these
  percentages as a floor against regression, never as evidence of quality.

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

## 2. Baseline — measured 2026-08-25

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

That last row is the point of the exercise. Every repository has a contract test
suite, and every suite runs against the in-memory fake only — each file says so
in its own header. The 12.7% is the number that says "the real persistence layer
is unverified", and it is why the adapters are **not** excluded from
measurement: hiding them would raise the aggregate by roughly 10 points and
erase the most important thing the report can tell you. Tracked as **KWM-063**
(contract suites against a real Postgres).

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
| Global | 68 | 60 | 65 | 67 |
| `src/modules/*/domain/**` | 95 | 95 | 95 | 95 |
| `src/modules/*/application/**` | 83 | 80 | 95 | 83 |

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
default once `include` is set, and it is load-bearing here: without it the
untested Drizzle adapters would drop out of the denominator entirely.

Two cautions when interpreting a file-level number:

- **High coverage on an in-memory adapter says nothing about its Drizzle
  sibling.** The pair share a contract suite; only one of them runs it.
- **A covered line is not a tested behaviour.** The action files sat at ~75%
  statements *before* any authorization test existed, because use-case tests
  imported them incidentally. Coverage told us those lines executed; it could
  not tell us no assertion protected the guards. That gap was found by reading
  the code, and closed by mutation-testing each guard by hand. Treat these
  percentages as a floor against regression, never as evidence of quality.

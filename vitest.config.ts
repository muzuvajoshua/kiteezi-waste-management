import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest setup. Server-side code (domain, use-cases, adapters, actions) runs in
// Node, so a 'node' environment is used rather than jsdom. The `@/…` alias
// mirrors tsconfig.json `paths` so tests import modules the same way the app
// does (e.g. `@/modules/auth/presentation/auth-guards`).
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',

      // Originally `['lib/**', 'utils/db/**']` — paths that stopped existing
      // when Phase 0 moved everything under `src/`. The stale globs matched two
      // files and 68 statements while reporting a plausible-looking "66%",
      // ignoring all of src/modules. Point at the real tree instead.
      include: ['src/**/*.{ts,tsx}'],

      exclude: [
        // Test code and its helpers are not the subject of measurement.
        '**/*.test.ts',
        '**/*.test-support.ts',
        '**/*.d.ts',

        // Next.js wiring, not logic: layout/page/metadata, plus the one-line
        // `export { POST } from '@/modules/...'` route shims. The real route
        // handlers live in src/modules/*/presentation/*.route.ts and ARE
        // measured (currently 0% — see the route note below). This directory
        // also holds fonts/favicon/css, which must never be instrumented.
        'src/app/**',

        // React components and hooks. These need a jsdom environment and
        // component tests, neither of which exists yet (KWM-062 / KWM-064);
        // under the 'node' environment above they cannot be exercised at all,
        // so counting them would only pin a permanent 0% to the totals without
        // adding any actionable signal. DELETE THESE TWO LINES when component
        // tests land — the intent is to measure them, not to exempt them.
        'src/components/**',
        'src/hooks/**',
      ],

      // Files with no test at all are reported too, not just files a test
      // happened to import — that is Vitest 4's default once `include` is set
      // (the old `all: true` flag no longer exists). It matters here: without
      // it the untested Drizzle adapters would drop out of the denominator and
      // inflate every number. Their 0% below is the honest signal for KWM-063.
      reporter: ['text', 'json-summary'],

      // Ratchet, not a target. Set just below the measured baseline recorded in
      // docs/testing/coverage.md so an unrelated refactor does not trip CI,
      // while a real drop does. Raise these as coverage genuinely improves;
      // never lower them to make a red build pass.
      // Measured 2026-08-25 (see docs/testing/coverage.md for the per-layer
      // breakdown). Floors sit a couple of points below each measurement:
      // slack for ordinary churn, not enough to absorb a deleted test file.
      //
      // The global floor is deliberately coarse — it catches wholesale removal
      // (dropping the 37 action-authorization tests trips all four) but not the
      // deletion of one small file. The per-layer floors below are the precise
      // instrument, aimed at the two layers holding the business rules, where
      // coverage is near-complete and any drop is a real loss rather than noise.
      thresholds: {
        // Global — measured: statements 70.00, branches 62.82, functions
        // 67.38, lines 69.46.
        statements: 68,
        branches: 60,
        functions: 65,
        lines: 67,

        // Domain — measured: 98.46 / 100 / 100 / 98.36. Pure business rules
        // with no I/O; there is no good reason for this to regress.
        'src/modules/*/domain/**': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },

        // Application (use-cases) — measured: 85.91 / 84.09 / 100 / 85.51.
        'src/modules/*/application/**': {
          statements: 83,
          branches: 80,
          functions: 95,
          lines: 83,
        },
      },
    },
  },
  resolve: {
    // Match only `@/…` so scoped npm packages (e.g. @vitest/…) are untouched.
    alias: [{ find: /^@\//, replacement: `${root}/src/` }],
  },
});

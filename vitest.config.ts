import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest setup. Server-side code (domain, use-cases, adapters, actions) runs in
// Node, so a 'node' environment is used rather than jsdom. The `@/…` alias
// mirrors tsconfig.json `paths` so tests import modules the same way the app
// does (e.g. `@/modules/auth/presentation/auth-guards`).
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig.json sets `jsx: "preserve"` because Next.js performs its own JSX
  // transform at build time. Vitest has no such downstream step, and Vite
  // refuses that setting outright ("make sure to not set jsx to preserve").
  //
  // This plugin owns the JSX transform for tests, so tsconfig.json is left
  // exactly as Next.js needs it. Overriding esbuild's `jsx` or `tsconfigRaw`
  // does NOT work here — Vite's import-analysis pass reads tsconfig.json
  // directly and rejects the file before either setting applies.
  plugins: [react()],
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
        // `.tsx` matters now that component/hook tests exist.
        '**/*.test.{ts,tsx}',
        '**/*.test-support.ts',
        'src/test-support/**',
        '**/*.d.ts',

        // Next.js wiring, not logic: layout/page/metadata, plus the one-line
        // `export { POST } from '@/modules/...'` route shims. The real route
        // handlers live in src/modules/*/presentation/*.route.ts and ARE
        // measured (currently 0% — see the route note below). This directory
        // also holds fonts/favicon/css, which must never be instrumented.
        'src/app/**',

        // React components. Now technically testable — jsdom and
        // @testing-library/react are wired up, see src/test-support — but no
        // component has a test yet, so they would contribute nothing but a
        // block of 0%. Delete this line as components gain tests; the intent
        // is to measure them, not to exempt them.
        //
        // `src/hooks/**` used to sit here and no longer does: useMediaQuery is
        // covered, and useSession's 0% is now visible in the totals rather
        // than hidden by an exclusion. Every floor still holds without being
        // lowered.
        'src/components/**',
      ],

      // Files with no test at all are reported too, not just files a test
      // happened to import — that is Vitest 4's default once `include` is set
      // (the old `all: true` flag no longer exists). It matters here: without
      // it a file nobody imports drops out of the denominator and inflates
      // every number. That is what kept the Drizzle adapters' 0% visible
      // until KWM-063 covered them.
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
        // Re-measured 2026-09-02 after KWM-063, which took the Drizzle
        // adapters from 0% to ~97% and moved every global figure ~17 points.
        //
        // Global — measured: statements 86.92, branches 85.06, functions
        // 87.97, lines 86.51.
        statements: 84,
        branches: 82,
        functions: 85,
        lines: 84,

        // Domain — measured: 97.44 / 100 / 100 / 97.30. Pure business rules
        // with no I/O; there is no good reason for this to regress.
        'src/modules/*/domain/**': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },

        // Application (use-cases) — measured: 88.42 / 88.04 / 100 / 87.71.
        'src/modules/*/application/**': {
          statements: 86,
          branches: 85,
          functions: 95,
          lines: 86,
        },

        // Drizzle adapters — measured: 97.46 / 96.15 / 95.45 / 97.32.
        //
        // This floor is the point of KWM-063. These files were at 0% for the
        // life of the project because each imported a module-scope `db` and
        // could not be pointed at a test database; covering them found a
        // redemption that could never succeed, a rate-limit sweep that
        // deleted live counters, and a repository returning columns its port
        // does not declare. A regression here means the contract runs against
        // real Postgres stopped happening, which is exactly the state this
        // issue existed to leave behind.
        'src/**/infrastructure/**/drizzle-*.ts': {
          statements: 95,
          branches: 90,
          functions: 90,
          lines: 95,
        },
      },
    },
  },
  resolve: {
    // Match only `@/…` so scoped npm packages (e.g. @vitest/…) are untouched.
    alias: [{ find: /^@\//, replacement: `${root}/src/` }],
  },
});

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Shared setup for React component tests. Import it once at the top of a
// component test file, directly under the environment docblock:
//
//   // @vitest-environment jsdom
//   import '@/test-support/component-testing';
//
// It registers `@testing-library/jest-dom` matchers (toBeInTheDocument,
// toBeDisabled, toHaveValue …) and unmounts each rendered tree afterwards.
//
// Why an explicit import rather than `setupFiles` in vitest.config.ts: setup
// files run for EVERY test file, and the vast majority of this suite is
// server-side code in the 'node' environment, where importing
// @testing-library/react fails (no document). Splitting via `test.projects`
// would also work, but it would restructure the coverage thresholds config
// for no gain — this codebase has far more node tests than component tests.
//
// Why the per-file `@vitest-environment jsdom` docblock rather than making
// jsdom the default: booting jsdom costs a little over a second per file, and
// only components need it. Node stays the default so the ~50 server-side test
// files pay nothing.
//
// RTL's own auto-cleanup does not fire here: it registers only when `afterEach`
// is a global, and this project runs Vitest without `globals: true`. Hence the
// explicit registration below — without it, trees from earlier tests stay
// mounted and `getByRole` starts matching elements from a previous test.
afterEach(() => {
  cleanup();
});

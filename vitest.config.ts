import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// KWM-060 — minimal Vitest setup. Scope is intentionally limited to enabling
// the server-side auth/RBAC unit tests for KWM-008/KWM-009 (no broad coverage
// yet). The session/RBAC code runs in Node, so a 'node' environment is used
// rather than jsdom. The `@/…` alias mirrors tsconfig.json `paths` so tests can
// import modules the same way the app does (e.g. `@/lib/rbac`).
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'utils/db/**'],
    },
  },
  resolve: {
    // Match only `@/…` so scoped npm packages (e.g. @vitest/…) are untouched.
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
});

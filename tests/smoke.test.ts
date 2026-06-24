import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

// KWM-060 smoke test — verifies the Vitest harness is wired correctly:
//   1. TypeScript test files execute.
//   2. The `@/…` path alias resolves (the KWM-008/KWM-009 RBAC tests will
//      import `@/lib/rbac`, `@/lib/session`, etc. the same way).
// It deliberately tests an existing dependency-free util, not app behaviour;
// real auth/RBAC coverage lands with KWM-008/KWM-009.
describe('vitest harness', () => {
  it('runs TypeScript and resolves the @/ alias', () => {
    expect(cn('a', 'b')).toBe('a b');
    // tailwind-merge dedupes conflicting utilities, proving the real module loaded.
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});

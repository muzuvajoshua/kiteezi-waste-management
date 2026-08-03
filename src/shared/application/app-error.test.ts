import { describe, it, expect } from 'vitest';
import { appError } from './app-error';

describe('appError()', () => {
  it('builds a plain, serializable object (no prototype)', () => {
    const e = appError('FORBIDDEN', 'not the resource owner');
    expect(e).toEqual({ code: 'FORBIDDEN', message: 'not the resource owner' });
    // Plain data, not a class instance — safe to return across the Server
    // Action serialization boundary (see the file-level comment for why).
    expect(Object.getPrototypeOf(e)).toBe(Object.prototype);
  });
});

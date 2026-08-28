import { describe, it, expect } from 'vitest';
import { DomainError } from '@/shared/domain/domain-error';
import { appError, fromDomainError } from './app-error';

class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK' as const;
}

describe('appError()', () => {
  it('builds a plain, serializable object (no prototype)', () => {
    const e = appError('FORBIDDEN', 'not the resource owner');
    expect(e).toEqual({ code: 'FORBIDDEN', message: 'not the resource owner' });
    // Plain data, not a class instance — safe to return across the Server
    // Action serialization boundary (see the file-level comment for why).
    expect(Object.getPrototypeOf(e)).toBe(Object.prototype);
  });
});

describe('fromDomainError()', () => {
  it('buckets into the given AppErrorCode while preserving the specific domain code', () => {
    const domainErr = new OutOfStockError('no more widgets');
    const e = fromDomainError(domainErr, 'CONFLICT');
    expect(e).toEqual({ code: 'CONFLICT', message: 'no more widgets', domainCode: 'OUT_OF_STOCK' });
    expect(Object.getPrototypeOf(e)).toBe(Object.prototype);
  });
});

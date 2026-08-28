import { describe, it, expect } from 'vitest';
import { DomainError } from '@/shared/domain/domain-error';
import { UnauthenticatedError, ForbiddenError } from './errors';

describe('auth domain errors carry explicit, stable codes', () => {
  it('UnauthenticatedError', () => {
    const e = new UnauthenticatedError();
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('UNAUTHENTICATED');
    expect(e.name).toBe('UnauthenticatedError');
    expect(e.message).toBe('Not authenticated');
  });

  it('ForbiddenError', () => {
    const e = new ForbiddenError();
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('FORBIDDEN');
    expect(e.name).toBe('ForbiddenError');
    expect(e.message).toBe('Insufficient permissions');
  });

  it('accepts a custom message', () => {
    const e = new ForbiddenError('Requires one of: admin');
    expect(e.message).toBe('Requires one of: admin');
  });
});

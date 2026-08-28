import { describe, it, expect } from 'vitest';
import { DomainError } from './domain-error';

class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK' as const;
}

describe('DomainError', () => {
  it('is a real Error with the concrete subclass name', () => {
    const e = new OutOfStockError('no more widgets');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(DomainError);
    expect(e.name).toBe('OutOfStockError');
    expect(e.message).toBe('no more widgets');
  });

  it('carries a stable, subclass-specific code', () => {
    const e = new OutOfStockError('x');
    expect(e.code).toBe('OUT_OF_STOCK');
  });
});

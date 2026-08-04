import { describe, it, expect } from 'vitest';
import { DomainError } from '@/shared/domain/domain-error';
import { InsufficientPointsError, RewardUnavailableError, InvalidPointTransactionError } from './errors';

describe('reward domain errors carry explicit, stable codes', () => {
  it('InsufficientPointsError', () => {
    const e = new InsufficientPointsError();
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('INSUFFICIENT_POINTS');
    expect(e.name).toBe('InsufficientPointsError');
  });

  it('RewardUnavailableError', () => {
    const e = new RewardUnavailableError();
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('REWARD_UNAVAILABLE');
    expect(e.name).toBe('RewardUnavailableError');
  });

  it('InvalidPointTransactionError', () => {
    const e = new InvalidPointTransactionError('bad sign');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('INVALID_POINT_TRANSACTION');
    expect(e.name).toBe('InvalidPointTransactionError');
    expect(e.message).toBe('bad sign');
  });
});

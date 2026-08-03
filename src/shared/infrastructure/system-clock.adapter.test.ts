import { describe, it, expect } from 'vitest';
import { SystemClock } from './system-clock.adapter';

describe('SystemClock', () => {
  it('returns the current time as a Date close to Date.now()', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    const after = Date.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});

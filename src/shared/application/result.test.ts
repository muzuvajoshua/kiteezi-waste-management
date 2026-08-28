import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, type Result } from './result';
import { appError } from './app-error';

describe('ok()/err() construction', () => {
  it('ok() produces an ok:true result carrying the value', () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('err() produces an ok:false result carrying the error', () => {
    const error = appError('NOT_FOUND', 'report 1 not found');
    const result = err(error);
    expect(result).toEqual({ ok: false, error });
  });
});

describe('isOk()/isErr() narrowing', () => {
  it('isOk narrows to the value branch', () => {
    const result: Result<number> = ok(7);
    if (isOk(result)) {
      // Compiles only if narrowed: result.value is accessible without a cast.
      expect(result.value).toBe(7);
    } else {
      throw new Error('expected ok');
    }
  });

  it('isErr narrows to the error branch', () => {
    const result: Result<number> = err(appError('VALIDATION', 'bad input'));
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION');
    } else {
      throw new Error('expected err');
    }
  });

  it('isOk/isErr are exact complements', () => {
    const good: Result<number> = ok(1);
    const bad: Result<number> = err(appError('UNEXPECTED', 'boom'));
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });
});

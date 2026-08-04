import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { validate, ValidationError } from '@/lib/validation';
import { collectedWasteSchema } from './index';

const ok = (schema: Parameters<typeof validate>[0], input: unknown) =>
  expect(schema.safeParse(input).success).toBe(true);
const bad = (schema: Parameters<typeof validate>[0], input: unknown) =>
  expect(schema.safeParse(input).success).toBe(false);

describe('id-only schemas', () => {
  it('collectedWasteSchema accepts positive, rejects non-positive', () => {
    ok(collectedWasteSchema, { reportId: 1 });
    bad(collectedWasteSchema, { reportId: 0 });
  });
});

describe('validate() helper', () => {
  it('returns parsed data on success', () => {
    expect(validate(collectedWasteSchema, { reportId: 4 })).toEqual({ reportId: 4 });
  });
  it('throws ValidationError (not a raw ZodError) on failure', () => {
    try {
      validate(collectedWasteSchema, { reportId: 0 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e).not.toBeInstanceOf(ZodError);
      expect((e as ValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

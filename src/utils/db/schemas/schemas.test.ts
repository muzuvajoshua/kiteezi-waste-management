import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { validate, ValidationError } from '@/lib/validation';
import { idSchema } from './common';

// The reward/auth/notification/report/collection-specific schemas that
// used to be exercised here have all moved to their own modules'
// presentation-layer tests. What's left in this barrel is common.ts's
// shared primitives — validate() is exercised directly against one of
// them rather than against a schema that no longer lives here.
describe('validate() helper', () => {
  it('returns parsed data on success', () => {
    expect(validate(idSchema, 4)).toEqual(4);
  });
  it('throws ValidationError (not a raw ZodError) on failure', () => {
    try {
      validate(idSchema, 0);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e).not.toBeInstanceOf(ZodError);
      expect((e as ValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

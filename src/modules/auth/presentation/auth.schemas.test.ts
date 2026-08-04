import { describe, it, expect } from 'vitest';
import { sessionRequestSchema } from './auth.schemas';

describe('sessionRequestSchema', () => {
  it('accepts a non-empty token', () => {
    expect(sessionRequestSchema.safeParse({ idToken: 'header.payload.sig' }).success).toBe(true);
  });
  it('rejects empty / oversized / missing', () => {
    expect(sessionRequestSchema.safeParse({ idToken: '' }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({ idToken: 'x'.repeat(4097) }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({}).success).toBe(false);
  });
});

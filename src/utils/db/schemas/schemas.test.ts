import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { validate, ValidationError } from '@/lib/validation';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
  collectedWasteSchema,
} from './index';

const ok = (schema: Parameters<typeof validate>[0], input: unknown) =>
  expect(schema.safeParse(input).success).toBe(true);
const bad = (schema: Parameters<typeof validate>[0], input: unknown) =>
  expect(schema.safeParse(input).success).toBe(false);

describe('createReportSchema', () => {
  const valid = { location: 'Kiteezi zone 4', wasteType: 'plastic', amount: '12' };
  it('accepts a valid report (with optional https imageUrl)', () => {
    ok(createReportSchema, valid);
    ok(createReportSchema, { ...valid, imageUrl: 'https://cdn.example.com/a.jpg' });
  });
  it('rejects empty / oversized location', () => {
    bad(createReportSchema, { ...valid, location: '' });
    bad(createReportSchema, { ...valid, location: 'x'.repeat(501) });
  });
  it('rejects an invalid waste type', () => bad(createReportSchema, { ...valid, wasteType: 'banana' }));
  it('rejects non-numeric / non-positive amount', () => {
    bad(createReportSchema, { ...valid, amount: 'abc' });
    bad(createReportSchema, { ...valid, amount: '0' });
    bad(createReportSchema, { ...valid, amount: '-5' });
  });
  it('rejects a non-https / malformed imageUrl', () => {
    bad(createReportSchema, { ...valid, imageUrl: 'http://x.com/a.jpg' });
    bad(createReportSchema, { ...valid, imageUrl: 'not a url' });
  });
});

describe('report status / task schemas', () => {
  it('accept valid', () => {
    ok(updateReportStatusSchema, { reportId: 5, status: 'approved' });
    ok(updateTaskStatusSchema, { reportId: 5, newStatus: 'collected' });
  });
  it('reject bad id or status', () => {
    bad(updateReportStatusSchema, { reportId: 0, status: 'approved' });
    bad(updateReportStatusSchema, { reportId: -1, status: 'approved' });
    bad(updateReportStatusSchema, { reportId: 1.5, status: 'approved' });
    bad(updateReportStatusSchema, { reportId: 5, status: 'bogus' });
    bad(updateTaskStatusSchema, { reportId: 5, newStatus: 'bogus' });
  });
});

describe('pagination limit schemas', () => {
  it('accept 1..100', () => {
    ok(recentReportsSchema, { limit: 10 });
    ok(wasteCollectionTasksSchema, { limit: 100 });
  });
  it('reject <=0, >100, float', () => {
    bad(recentReportsSchema, { limit: 0 });
    bad(recentReportsSchema, { limit: -1 });
    bad(recentReportsSchema, { limit: 101 });
    bad(recentReportsSchema, { limit: 2.5 });
  });
});

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

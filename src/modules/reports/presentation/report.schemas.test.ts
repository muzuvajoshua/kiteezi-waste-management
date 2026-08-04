import { describe, it, expect } from 'vitest';
import {
  createReportSchema,
  updateReportStatusSchema,
  updateTaskStatusSchema,
  recentReportsSchema,
  wasteCollectionTasksSchema,
} from './report.schemas';

describe('createReportSchema', () => {
  const valid = { location: 'Kiteezi zone 4', wasteType: 'plastic', amount: '12' };
  it('accepts a valid report (with optional https imageUrl)', () => {
    expect(createReportSchema.safeParse(valid).success).toBe(true);
    expect(createReportSchema.safeParse({ ...valid, imageUrl: 'https://cdn.example.com/a.jpg' }).success).toBe(true);
  });
  it('rejects empty / oversized location', () => {
    expect(createReportSchema.safeParse({ ...valid, location: '' }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, location: 'x'.repeat(501) }).success).toBe(false);
  });
  it('rejects an invalid waste type', () => {
    expect(createReportSchema.safeParse({ ...valid, wasteType: 'banana' }).success).toBe(false);
  });
  it('rejects non-numeric / non-positive amount', () => {
    expect(createReportSchema.safeParse({ ...valid, amount: 'abc' }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, amount: '-5' }).success).toBe(false);
  });
  it('rejects a non-https / malformed imageUrl', () => {
    expect(createReportSchema.safeParse({ ...valid, imageUrl: 'http://x.com/a.jpg' }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, imageUrl: 'not a url' }).success).toBe(false);
  });
});

describe('report status / task schemas', () => {
  it('accept valid', () => {
    expect(updateReportStatusSchema.safeParse({ reportId: 5, status: 'approved' }).success).toBe(true);
    expect(updateTaskStatusSchema.safeParse({ reportId: 5, newStatus: 'collected' }).success).toBe(true);
  });
  it('reject bad id or status', () => {
    expect(updateReportStatusSchema.safeParse({ reportId: 0, status: 'approved' }).success).toBe(false);
    expect(updateReportStatusSchema.safeParse({ reportId: -1, status: 'approved' }).success).toBe(false);
    expect(updateReportStatusSchema.safeParse({ reportId: 1.5, status: 'approved' }).success).toBe(false);
    expect(updateReportStatusSchema.safeParse({ reportId: 5, status: 'bogus' }).success).toBe(false);
    expect(updateTaskStatusSchema.safeParse({ reportId: 5, newStatus: 'bogus' }).success).toBe(false);
  });
});

describe('pagination limit schemas', () => {
  it('accept 1..100', () => {
    expect(recentReportsSchema.safeParse({ limit: 10 }).success).toBe(true);
    expect(wasteCollectionTasksSchema.safeParse({ limit: 100 }).success).toBe(true);
  });
  it('reject <=0, >100, float', () => {
    expect(recentReportsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(recentReportsSchema.safeParse({ limit: -1 }).success).toBe(false);
    expect(recentReportsSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(recentReportsSchema.safeParse({ limit: 2.5 }).success).toBe(false);
  });
});

import { z, ZodError } from 'zod';

// KWM-017 — shared validation layer.
//
// `ValidationError` is the third member of the action-boundary error taxonomy
// (alongside UnauthorizedError / ForbiddenError in lib/rbac.ts). Server actions
// validate their inputs *after* the auth guard and throw this on bad input; the
// thrown error rejects the action promise so the UI can surface a toast.
// KWM-019 will map this to a typed Result `{ ok:false, code:'VALIDATION', … }`.
export class ValidationError extends Error {
  readonly issues: { path: string; message: string }[];

  constructor(error: ZodError) {
    const issues = error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    }));
    super(issues.map((i) => `${i.path}: ${i.message}`).join('; ') || 'Invalid input');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/**
 * Parses `input` with `schema`, returning the typed value. Throws
 * `ValidationError` (not a raw ZodError) on failure so callers have one error
 * type to catch.
 */
export function validate<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}

import { type Result, err } from '@/shared/application/result';
import {
  type AppError,
  type AppErrorCode,
  appError,
  fromDomainError,
} from '@/shared/application/app-error';
import { DomainError } from '@/shared/domain/domain-error';
import { ValidationError } from '@/lib/validation';

// KWM-019 — the server-action boundary.
//
// Server actions used to end in three different ways: return the value,
// return a `null`/`[]` fallback after a console.error, or throw. Callers
// could not handle failure uniformly, and two of those were actively
// misleading — an empty array for a failed query is indistinguishable from
// an empty result, and `null` cannot say whether validation, authorization
// or the database was at fault.
//
// Throwing is worse than it looks in this runtime. Next.js redacts Server
// Action errors crossing to the client in production, replacing the message
// with an opaque digest, so `throw new Error(result.error.message)` cannot
// surface anything useful to a user. shared/application/app-error.ts already
// spelled out the intended end state: "presentation code never throws or
// catches AppError, it only branches on `.code`". This is what makes that
// true — every action wraps its body here and returns Result<T, AppError>.

const APP_ERROR_CODES: readonly AppErrorCode[] = [
  'VALIDATION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'UNEXPECTED',
];

function isAppErrorCode(code: string): code is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Runs a server action's body and guarantees a `Result` — it never throws.
 *
 * A `Result` returned by a use-case passes through untouched. Anything
 * *thrown* on the way is translated:
 *
 * | Thrown | Becomes |
 * |---|---|
 * | `ValidationError` (Zod, via `validate()`) | `VALIDATION`, message keeps the field detail |
 * | `DomainError` whose `code` is an `AppErrorCode` — `UnauthenticatedError`, `ForbiddenError` | that code |
 * | any other `DomainError` — e.g. `InsufficientPointsError` | `CONFLICT`, with `domainCode` preserved |
 * | anything else | `UNEXPECTED`, message replaced |
 *
 * The auth guards are reached through the middle row rather than by importing
 * the auth module: their `code` values already *are* `AppErrorCode`s, so this
 * helper stays in `shared/` without depending on a module — which the
 * dependency rule requires.
 */
export async function actionResult<T>(
  work: () => Promise<Result<T, AppError>>
): Promise<Result<T, AppError>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ValidationError) {
      return err(appError('VALIDATION', error.message));
    }

    if (error instanceof DomainError) {
      return err(
        isAppErrorCode(error.code)
          ? fromDomainError(error, error.code)
          : fromDomainError(error, 'CONFLICT')
      );
    }

    // A genuine fault, not an expected failure mode. Log it server-side —
    // returning a Result must not make crashes quieter than the console.error
    // calls this replaced — but hand the client a generic message: action
    // return values reach the browser, and a raw fault message can carry
    // connection strings, credentials or SQL.
    console.error('Unhandled error in server action:', error);
    return err(appError('UNEXPECTED', 'Something went wrong. Please try again.'));
  }
}

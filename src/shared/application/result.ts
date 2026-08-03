// The application-layer boundary contract (ADR-003 / KWM-019). A use-case
// returns Result<T, AppError> instead of throwing for expected failure modes
// (not-found, forbidden, invalid input) so presentation code is forced to
// handle both branches rather than relying on try/catch discipline.
export type Result<T, E = import('./app-error').AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

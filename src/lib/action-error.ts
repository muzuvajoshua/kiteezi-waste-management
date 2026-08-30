import type { AppError } from '@/shared/application/app-error';

const GENERIC = 'Something went wrong. Please try again.';

// KWM-019 — turns the `AppError` a server action returns into something worth
// showing a person. Lives here rather than inside a component so every page
// uses one vocabulary for the same failure.
//
// Two codes get a fixed message regardless of what the server said:
//
//   UNAUTHENTICATED / FORBIDDEN — the server's wording ("Not authenticated",
//   "Insufficient permissions") is accurate but reads like a stack trace.
//
//   UNEXPECTED — `actionResult` already replaces the underlying message before
//   it leaves the server, and this is the second line of defence: a raw fault
//   message can carry connection strings, credentials or SQL, so it must never
//   reach a toast even if that upstream guarantee changes.
//
// The rest pass the server message through, because it is the specific part
// worth reading — which field failed validation, which business rule was
// violated, what was not found.
export interface ActionErrorOptions {
  /**
   * `'signIn'` when the caller IS the sign-in flow.
   *
   * UNAUTHENTICATED normally means "you are not signed in", so it is rewritten
   * to "Please sign in to continue." On a sign-in form that same code means
   * "those credentials were wrong", and the rewrite would tell someone staring
   * at the sign-in form to go and sign in. This opts out of it.
   *
   * Passing the server's message through here is safe: sign-in deliberately
   * returns one identical message for every failure, so it cannot reveal
   * whether an address is registered.
   */
  readonly context?: 'signIn';
}

const GENERIC_SIGN_IN_FAILURE = 'Incorrect email address or password.';

export function actionErrorMessage(error: AppError, options: ActionErrorOptions = {}): string {
  switch (error.code) {
    case 'UNAUTHENTICATED':
      if (options.context === 'signIn') {
        return error.message.trim() || GENERIC_SIGN_IN_FAILURE;
      }
      return 'Please sign in to continue.';
    case 'FORBIDDEN':
      return "You don't have permission to do that.";
    case 'RATE_LIMITED':
      // Passed through: the server's message states how long to wait, which
      // is the only actionable part. A generic "slow down" would leave the
      // user guessing whether to retry in a second or an hour.
      return error.message.trim() || 'Too many attempts. Please try again shortly.';
    case 'UNEXPECTED':
      return GENERIC;
    default:
      return error.message.trim() || GENERIC;
  }
}

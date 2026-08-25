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
export function actionErrorMessage(error: AppError): string {
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return 'Please sign in to continue.';
    case 'FORBIDDEN':
      return "You don't have permission to do that.";
    case 'UNEXPECTED':
      return GENERIC;
    default:
      return error.message.trim() || GENERIC;
  }
}

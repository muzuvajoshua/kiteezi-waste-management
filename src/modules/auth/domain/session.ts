/**
 * How long a session lasts.
 *
 * Previously a literal in presentation/composition.ts, consumed by two
 * Infrastructure adapters (the JWT `exp` and the cookie `Max-Age`). Since
 * KWM-079 the session RECORD needs the same value, and a use-case needs it —
 * so it belongs in Domain rather than being threaded down from the
 * composition root or duplicated at a third site.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

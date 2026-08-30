// How long a reset link stays valid.
//
// One hour is the usual balance: long enough to survive a slow mail hop and
// a user who reads mail on their phone later, short enough that a link left
// in an inbox, a forwarded message, or a proxy log stops being a credential
// quickly. Combined with single use (`used_at`), a leaked link is only
// dangerous within this window AND only if nobody has already used it.
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

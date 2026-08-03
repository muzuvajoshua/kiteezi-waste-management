// KWM-011 — domain errors for the reward flows.
//
// Each carries an explicit, stable `code` so KWM-019 can map it directly into
// the typed Result taxonomy (`{ ok:false, code, message }`) without matching on
// message strings. Mirrors the boundary errors in lib/rbac.ts (Unauthorized /
// Forbidden) and lib/validation.ts (ValidationError).

export class InsufficientPointsError extends Error {
  readonly code = 'INSUFFICIENT_POINTS' as const;
  constructor(message = 'Insufficient points for this redemption') {
    super(message);
    this.name = 'InsufficientPointsError';
  }
}

export class RewardUnavailableError extends Error {
  readonly code = 'REWARD_UNAVAILABLE' as const;
  constructor(message = 'Reward is not available') {
    super(message);
    this.name = 'RewardUnavailableError';
  }
}

import { DomainError } from '@/shared/domain/domain-error';

// KWM-009 — domain errors for authentication/authorization. Moved from
// src/lib/rbac.ts onto the shared DomainError base (Phase 0), with one
// deliberate rename: UnauthorizedError -> UnauthenticatedError. The old name
// was genuinely ambiguous (HTTP "Unauthorized" traditionally means "not
// authenticated", easily confused with "Forbidden" = authenticated but
// disallowed) and now maps 1:1 onto the AppErrorCode value it produces
// ('UNAUTHENTICATED', sitting unused since Phase 0 until this module).

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED' as const;
  constructor(message = 'Not authenticated') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

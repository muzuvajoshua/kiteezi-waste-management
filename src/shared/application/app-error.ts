import type { DomainError } from '@/shared/domain/domain-error';

// The error shape a use-case returns via Result<T, AppError>. Deliberately a
// plain, serializable object rather than a class hierarchy: Next.js Server
// Actions serialize their return value across the server/client boundary,
// and thrown class instances (DomainError, ValidationError, etc.) lose their
// prototype there. Application-layer code catches those class-based errors
// and maps them to this shape before returning; presentation code never
// throws or catches AppError, it only branches on `.code`.
export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'UNEXPECTED';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  // Present when this AppError was mapped from a DomainError: the specific,
  // stable domain error code (e.g. 'INSUFFICIENT_POINTS'), for UI messaging
  // finer-grained than the coarse AppErrorCode bucket it was mapped into.
  readonly domainCode?: string;
}

export function appError(code: AppErrorCode, message: string): AppError {
  return { code, message };
}

// Maps a caught DomainError onto the Result boundary's AppError shape. The
// caller picks the coarse AppErrorCode bucket (e.g. both
// InsufficientPointsError and RewardUnavailableError map to 'CONFLICT');
// the DomainError's own `.code` is preserved as `domainCode`.
export function fromDomainError(error: DomainError, code: AppErrorCode): AppError {
  return { code, message: error.message, domainCode: error.code };
}

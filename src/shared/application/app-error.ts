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
}

export function appError(code: AppErrorCode, message: string): AppError {
  return { code, message };
}

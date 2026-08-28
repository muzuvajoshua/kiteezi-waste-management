// Base for errors representing a violated business rule (e.g.
// InsufficientPointsError, RewardUnavailableError in lib/errors.ts). Domain
// errors are expected, named failure modes — not exceptional faults — so
// every subclass carries a stable `code` the Application layer can switch on
// without matching against `.message` text. They are thrown and caught
// within server-side domain/application code; they are never returned
// directly to a client (see shared/application/app-error.ts for the
// serializable shape that crosses that boundary).
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

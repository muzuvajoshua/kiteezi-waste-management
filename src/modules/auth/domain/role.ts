// Deliberately NOT imported from utils/db/schema.ts's ROLE_NAMES/Role: the
// Domain layer must not depend on Drizzle (even for a type-only import of a
// module that also constructs pgTable objects). The Infrastructure adapters
// map between this union and the DB enum at the boundary — the string
// values are kept identical by convention, not by a shared import. Mirrors
// the rewards module's PointKind precedent from Phase 1.
export const ROLE_NAMES = ['citizen', 'operator', 'supervisor', 'admin', 'dump_op'] as const;
export type Role = (typeof ROLE_NAMES)[number];

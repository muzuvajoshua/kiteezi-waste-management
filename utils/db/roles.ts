import { db } from './dbConfig';
import { Roles, UserRoles } from './schema';
import type { Role } from './schema';
import { eq } from 'drizzle-orm';

// KWM-008 — role read/grant helpers. Plain module (NOT "use server"): called
// only from trusted server code (the auth route assigns the default role; the
// RBAC resolver reads roles). Roles are resolved from the DB on each check so a
// revoked grant takes effect immediately — the session cookie is never trusted
// for authorization, only for identity.

/** Returns the role names granted to a user (empty array if none). */
export async function getUserRoles(userId: number): Promise<Role[]> {
  const rows = await db
    .select({ name: Roles.name })
    .from(UserRoles)
    .innerJoin(Roles, eq(UserRoles.roleId, Roles.id))
    .where(eq(UserRoles.userId, userId))
    .execute();
  return rows.map((r) => r.name as Role);
}

/** Grants a role to a user. Idempotent: re-granting the same role is a no-op. */
export async function assignRole(
  userId: number,
  roleName: Role,
  grantedBy?: number
): Promise<void> {
  const [role] = await db
    .select({ id: Roles.id })
    .from(Roles)
    .where(eq(Roles.name, roleName))
    .execute();
  if (!role) {
    throw new Error(`Unknown role: ${roleName}`);
  }
  await db
    .insert(UserRoles)
    .values({ userId, roleId: role.id, grantedBy: grantedBy ?? null })
    .onConflictDoNothing()
    .execute();
}

import { eq } from 'drizzle-orm';
import { db } from '@/utils/db/dbConfig';
import { Roles, UserRoles } from '@/utils/db/schema';
import type { RoleRepository } from '../application/ports/role-repository.port';
import type { Role } from '../domain/role';

// Relocated from utils/db/roles.ts, unchanged.
export class DrizzleRoleRepository implements RoleRepository {
  async getUserRoles(userId: number): Promise<Role[]> {
    const rows = await db
      .select({ name: Roles.name })
      .from(UserRoles)
      .innerJoin(Roles, eq(UserRoles.roleId, Roles.id))
      .where(eq(UserRoles.userId, userId))
      .execute();
    return rows.map((r) => r.name as Role);
  }

  async assignRole(userId: number, roleName: Role, grantedBy?: number): Promise<void> {
    const [role] = await db.select({ id: Roles.id }).from(Roles).where(eq(Roles.name, roleName)).execute();
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }
    await db
      .insert(UserRoles)
      .values({ userId, roleId: role.id, grantedBy: grantedBy ?? null })
      .onConflictDoNothing()
      .execute();
  }
}

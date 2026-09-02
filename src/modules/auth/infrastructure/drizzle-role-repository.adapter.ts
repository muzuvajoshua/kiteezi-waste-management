import { eq } from 'drizzle-orm';
import type { Database } from '@/shared/infrastructure/persistence/database';
import { Roles, UserRoles } from '@/utils/db/schema';
import type { RoleRepository } from '../application/ports/role-repository.port';
import type { Role } from '../domain/role';

// Relocated from utils/db/roles.ts, unchanged.
export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: Database) {}

  async getUserRoles(userId: number): Promise<Role[]> {
    const rows = await this.db
      .select({ name: Roles.name })
      .from(UserRoles)
      .innerJoin(Roles, eq(UserRoles.roleId, Roles.id))
      .where(eq(UserRoles.userId, userId))
      .execute();
    return rows.map((r) => r.name as Role);
  }

  async assignRole(userId: number, roleName: Role, grantedBy?: number): Promise<void> {
    const [role] = await this.db.select({ id: Roles.id }).from(Roles).where(eq(Roles.name, roleName)).execute();
    if (!role) {
      throw new Error(`Unknown role: ${roleName}`);
    }
    await this.db
      .insert(UserRoles)
      .values({ userId, roleId: role.id, grantedBy: grantedBy ?? null })
      .onConflictDoNothing()
      .execute();
  }
}

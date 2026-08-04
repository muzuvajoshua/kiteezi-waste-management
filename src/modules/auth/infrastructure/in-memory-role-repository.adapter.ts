import type { RoleRepository } from '../application/ports/role-repository.port';
import type { Role } from '../domain/role';

export class InMemoryRoleRepository implements RoleRepository {
  private readonly rolesByUserId = new Map<number, Set<Role>>();

  seedRoles(userId: number, roles: Role[]): void {
    this.rolesByUserId.set(userId, new Set(roles));
  }

  async getUserRoles(userId: number): Promise<Role[]> {
    return [...(this.rolesByUserId.get(userId) ?? [])];
  }

  async assignRole(userId: number, role: Role): Promise<void> {
    const roles = this.rolesByUserId.get(userId) ?? new Set<Role>();
    roles.add(role);
    this.rolesByUserId.set(userId, roles);
  }
}

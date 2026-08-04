import type { Role } from '../../domain/role';

export interface RoleRepository {
  getUserRoles(userId: number): Promise<Role[]>;
  // Idempotent: re-granting the same role is a no-op.
  assignRole(userId: number, role: Role, grantedBy?: number): Promise<void>;
}

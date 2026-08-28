export interface UserRecord {
  readonly id: number;
  readonly email: string;
  readonly name: string;
}

export interface UserRepository {
  getUserById(id: number): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(email: string, name: string): Promise<UserRecord | null>;
}

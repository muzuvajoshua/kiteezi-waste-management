// Port: where the session token lives between requests (a cookie today).
export interface SessionStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

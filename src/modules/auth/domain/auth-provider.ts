// The mechanisms a person can authenticate by. Declared here rather than
// imported from utils/db/schema.ts's authProviderEnum: the Domain layer must
// not depend on Drizzle even for a type-only import. Mirrors the Role and
// ReportStatus precedents.
export const AUTH_PROVIDERS = ['google', 'password'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

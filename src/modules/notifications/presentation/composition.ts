import { DrizzleNotificationRepository } from '../infrastructure/drizzle-notification-repository.adapter';

// This module's slice of the composition root. Exported for reuse by the
// `reports` module's own composition.ts (createReport needs to call
// createNotification post-commit) — the first module-to-module composition
// reuse in this codebase.
export const notificationRepository = new DrizzleNotificationRepository();

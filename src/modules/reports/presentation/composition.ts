import { DrizzleReportRepository } from '../infrastructure/drizzle-report-repository.adapter';
import { DrizzleReportTransactionManager } from '../infrastructure/drizzle-report-transaction-manager.adapter';

// This module's slice of the composition root: module-scope singletons,
// same lazy/cheap-construction pattern as the rewards/auth/notifications
// modules' own composition.ts files. createReport needs notifications'
// composed singleton too — imported directly in report.actions.ts from
// @/modules/notifications/presentation/composition, the second
// module-to-module composition reuse in this codebase.
export const reportRepository = new DrizzleReportRepository();
export const reportTransactionManager = new DrizzleReportTransactionManager();

import { z } from 'zod';
import { idSchema } from '@/utils/db/schemas/common';

// KWM-017 — notification action input schema. Relocated from
// utils/db/schemas/notifications.ts as part of the notifications module
// extraction; content unchanged.
export const markNotificationReadSchema = z.object({ notificationId: idSchema });

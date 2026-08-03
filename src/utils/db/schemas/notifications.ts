import { z } from 'zod';
import { idSchema } from './common';

// KWM-017 — notification action input schema.
export const markNotificationReadSchema = z.object({ notificationId: idSchema });

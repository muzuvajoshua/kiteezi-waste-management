import { z } from 'zod';
import { idSchema } from './common';

// KWM-017 — shared by createCollectedWaste and saveCollectedWaste.
export const collectedWasteSchema = z.object({ reportId: idSchema });

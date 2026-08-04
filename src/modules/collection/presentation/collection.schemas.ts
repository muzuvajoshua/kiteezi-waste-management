import { z } from 'zod';
import { idSchema } from '@/utils/db/schemas/common';

// KWM-017 — shared by createCollectedWaste and saveCollectedWaste.
// Relocated from utils/db/schemas/collection.ts as part of the collection
// module extraction; content unchanged.
export const collectedWasteSchema = z.object({ reportId: idSchema });

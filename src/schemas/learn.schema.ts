import { z } from 'zod'
import { teachSchema } from './teach.schema'

/**
 * Request contract for POST /api/v1/kb/:org/learn.
 * Bulk ingestion of captured elements (each element is a teach payload). Used by
 * recorders/explorers and the harvester tool to seed an org's KB.
 */
export const learnSchema = z.object({
  elements: z.array(teachSchema).min(1).max(500),
})

export type LearnRequest = z.infer<typeof learnSchema>

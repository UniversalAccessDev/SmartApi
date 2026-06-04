import { z } from 'zod'

/**
 * Request contract for POST /api/v1/playwright/generate.
 * Validated with Zod so malformed requests are rejected with a 400 before
 * they ever reach the rules engine.
 */
export const generateSchema = z.object({
  testName: z.string().min(1, 'testName is required'),
  url: z.string().url('url must be a valid URL'),
  steps: z
    .array(z.string().min(1, 'steps cannot contain empty strings'))
    .min(1, 'at least one step is required'),
  language: z.enum(['typescript', 'javascript']).default('typescript'),
  includeScreenshots: z.boolean().default(false),
  closeOverlaysWithEscape: z.boolean().default(false),
})

export type GenerateInput = z.infer<typeof generateSchema>

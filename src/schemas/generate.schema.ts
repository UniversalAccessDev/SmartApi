import { z } from 'zod'

/**
 * Request contract for POST /api/v1/playwright/generate.
 * Validated with Zod so malformed requests are rejected with a 400 before
 * they ever reach the rules engine.
 */
// Bounds to keep requests sane and prevent abuse (huge payloads / DoS).
export const MAX_STEPS = 200
export const MAX_STEP_LENGTH = 500
export const MAX_NAME_LENGTH = 200

export const generateSchema = z.object({
  testName: z.string().min(1, 'testName is required').max(MAX_NAME_LENGTH),
  url: z.string().url('url must be a valid URL').max(2048),
  steps: z
    .array(
      z
        .string()
        .min(1, 'steps cannot contain empty strings')
        .max(MAX_STEP_LENGTH, `each step must be <= ${MAX_STEP_LENGTH} characters`),
    )
    .min(1, 'at least one step is required')
    .max(MAX_STEPS, `at most ${MAX_STEPS} steps are allowed`),
  language: z.enum(['typescript', 'javascript']).default('typescript'),
  includeScreenshots: z.boolean().default(false),
  closeOverlaysWithEscape: z.boolean().default(false),
})

export type GenerateInput = z.infer<typeof generateSchema>

import { z } from 'zod'
import {
  MAX_STEPS,
  MAX_STEP_LENGTH,
  MAX_NAME_LENGTH,
  NO_CONTROL_CHARS,
  noControlChars,
} from './generate.schema'

/**
 * Request contract for POST /api/v1/playwright/analyze.
 * Analysis is a dry, read-only pass: no code generation, no browser. So `url`
 * is optional (we never navigate) and there are no output/codegen options.
 */
export const analyzeSchema = z.object({
  testName: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .regex(NO_CONTROL_CHARS, noControlChars('testName'))
    .default('Untitled analysis'),
  url: z.string().url('url must be a valid URL').max(2048).optional(),
  steps: z
    .array(
      z
        .string()
        .min(1, 'steps cannot contain empty strings')
        .max(MAX_STEP_LENGTH, `each step must be <= ${MAX_STEP_LENGTH} characters`)
        .regex(NO_CONTROL_CHARS, noControlChars('steps')),
    )
    .min(1, 'at least one step is required')
    .max(MAX_STEPS, `at most ${MAX_STEPS} steps are allowed`),
  closeOverlaysWithEscape: z.boolean().default(false),
})

export type AnalyzeInput = z.infer<typeof analyzeSchema>

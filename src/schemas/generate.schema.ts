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

// Reject control characters / null bytes (tab, newline, carriage-return allowed).
// Built from escaped code points so no literal control chars live in source — a
// classic injection vector with no legitimate place in a test name or step.
export const NO_CONTROL_CHARS = new RegExp(
  '^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]*$',
)
export const noControlChars = (label: string) =>
  `${label} must not contain control characters`

export const generateSchema = z.object({
  testName: z
    .string()
    .min(1, 'testName is required')
    .max(MAX_NAME_LENGTH)
    .regex(NO_CONTROL_CHARS, noControlChars('testName')),
  url: z.string().url('url must be a valid URL').max(2048),
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
  language: z.enum(['typescript', 'javascript']).default('typescript'),
  includeScreenshots: z.boolean().default(false),
  closeOverlaysWithEscape: z.boolean().default(false),
  // "playwright" (default) returns code; "actions" returns a structured action-JSON
  // array for executors that don't run Playwright TypeScript directly.
  outputFormat: z.enum(['playwright', 'actions']).default('playwright'),
})

export type GenerateInput = z.infer<typeof generateSchema>

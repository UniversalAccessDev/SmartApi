import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

/**
 * Validate and normalize environment variables at startup so the rest of the
 * app can rely on a typed, sane config object instead of reading process.env.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of accepted API keys. When empty, auth is disabled
  // ("open mode") — handy for local dev; set this in production to lock it down.
  API_KEYS: z.string().default(''),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  // Fail fast with a readable message rather than crashing deep in the app.
  console.error('Invalid environment configuration:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data

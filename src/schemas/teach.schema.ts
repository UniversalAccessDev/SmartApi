import { z } from 'zod'

/**
 * Request contract for POST /api/v1/kb/:org/teach.
 * Teach one or more phrases that all resolve to the same element via exactly
 * one locator strategy. Raw locator strings are intentionally NOT accepted —
 * the server builds the Playwright expression from these structured fields.
 */
export const teachSchema = z
  .object({
    phrases: z.array(z.string().min(1).max(120)).min(1).max(20),
    role: z.string().max(40).optional(),
    name: z.string().max(200).optional(),
    label: z.string().max(200).optional(),
    placeholder: z.string().max(200).optional(),
    text: z.string().max(200).optional(),
    testid: z.string().max(200).optional(),
    css: z.string().max(400).optional(),
    page: z.string().max(400).optional(),
  })
  .refine((d) => d.role || d.label || d.placeholder || d.text || d.testid || d.css, {
    message: 'Provide at least one locator: role, label, placeholder, text, testid, or css.',
  })

export type TeachRequest = z.infer<typeof teachSchema>

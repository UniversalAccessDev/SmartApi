/**
 * Convert an arbitrary string into a filesystem- and URL-safe slug.
 * Used for naming screenshot files derived from the test name.
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test'

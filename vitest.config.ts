import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Keep the KB ephemeral during tests (no file written to disk).
    env: { KB_DB_PATH: ':memory:' },
  },
})

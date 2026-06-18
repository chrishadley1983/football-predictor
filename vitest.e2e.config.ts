import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Live end-to-end run: drives the REAL simulation + scoring code against the
// shared Supabase DB's wc-2026-test tournament. Standalone config (NOT merged
// with the base) so `include` is ONLY the live file — the normal suite never
// runs here. Run explicitly:
//   npx vitest run --config vitest.e2e.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/e2e/**/*.live.ts'],
    setupFiles: ['./tests/e2e/load-env.ts'],
    testTimeout: 240_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})

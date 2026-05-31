import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Match tsconfig "@/*" -> "./src/*"
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `import 'server-only'` is a Next.js guard that throws outside RSC.
      // Stub it to a no-op so server libs can be unit-tested in Node.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})

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
    // Default environment is node (logic/route/perf tests). Component tests opt
    // into jsdom with a `// @vitest-environment jsdom` docblock at the top.
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
